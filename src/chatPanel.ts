import * as vscode from 'vscode';
import { OllamaService, OllamaMessage, ToolCall, OllamaTool } from './ollama';
import { VllmService } from './vllmService';
import { getOllamaTools, getSystemPrompt, executeTool, applyPendingEdit, rejectPendingEdit, applyAllPendingEdits, rejectAllPendingEdits, getPendingEditsCount, onPendingEditsChanged } from './tools';
import { MemoryService, ChatSession } from './memory';
import { showGeneratingStatus, updateGeneratingStatus, hideGeneratingStatus, showReadyStatus, outputChannel } from './extension';

export function log(message: string): void {
    if (outputChannel) {
        outputChannel.appendLine(message);
    }
    console.log(message);
}

export type ProviderType = 'ollama' | 'vllm';

interface AIProvider {
    chatWithTools(model: string, messages: OllamaMessage[], tools: OllamaTool[], onToken?: (token: string) => void, signal?: AbortSignal): Promise<{ content: string; toolCalls: ToolCall[] }>;
    chat(model: string, messages: OllamaMessage[], onToken?: (token: string) => void): Promise<string>;
    listModels(): Promise<string[]>;
    isAvailable(): Promise<boolean>;
    setBaseUrl(url: string): void;
    getCurrentUrl(): string;
}

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly ollama: OllamaService;
    private readonly vllm: VllmService;
    private currentProvider: ProviderType = 'ollama';
    private messages: OllamaMessage[] = [];
    private selectedModel: string = '';
    private abortController: AbortController | null = null;
    private memory: MemoryService;
    private currentSession: ChatSession | null = null;
    private waitingForApproval: boolean = false;
    private lastPendingCount: number = 0;
    private autoApproveMode: boolean = false;
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, memoryService: MemoryService) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.ollama = new OllamaService();
        this.vllm = new VllmService();
        this.memory = memoryService;

        this.panel.webview.html = this.getHtmlContent();

        // Pending edit değişikliklerini dinle
        onPendingEditsChanged(() => {
            const currentCount = getPendingEditsCount();
            if (this.waitingForApproval && currentCount < this.lastPendingCount) {
                this.waitingForApproval = false;
                this.continueAfterApproval();
            }
            this.lastPendingCount = currentCount;
            this.updatePendingEditsCount();
        });

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        await this.handleUserMessage(message.text, message.context);
                        break;
                    case 'selectModel':
                        this.selectedModel = message.model;
                        break;
                    case 'selectProvider':
                       this.currentProvider = message.provider as ProviderType;
                        // Reset model so sendModelList() will pick correct default for new provider
                        this.selectedModel = '';

                        console.log('[LocalAI] Provider changed to:', this.currentProvider);
                        await this.sendModelList();
                        break;
                    case 'getModels':
                        await this.sendModelList();
                        break;
                    case 'updateApiUrl':
                        this.getActiveProvider().setBaseUrl(message.url);
                        await this.sendModelList();
                        break;
                    case 'clearChat':
                        this.messages = [];
                        await this.memory.clearCurrentMessages();
                        break;
                    case 'newSession':
                        this.messages = [];
                        this.currentSession = await this.memory.createNewSession(this.selectedModel);
                        break;
                    case 'loadSession':
                        await this.loadSession(message.sessionId);
                        break;
                    case 'getSessions':
                        await this.sendSessionList();
                        break;
                    case 'deleteSession':
                        await this.memory.deleteSession(message.sessionId);
                        await this.sendSessionList();
                        break;
                    case 'stopGeneration':
                        this.stopGeneration();
                        break;
                    case 'ready':
                        await this.sendModelList();
                        await this.initSession();
                        await this.sendSessionList();
                        if (this.currentSession && this.messages.length > 0) {
                            this.panel.webview.postMessage({
                                command: 'loadedSession',
                                session: {
                                    id: this.currentSession.id,
                                    title: this.currentSession.title,
                                    model: this.currentSession.model,
                                    messageCount: this.messages.length
                                },
                                messages: this.messages.filter(m => m.role === 'user' || m.role === 'assistant')
                            });
                        }
                        break;
                    case 'approveEdit':
                        const approveResult = await applyPendingEdit(message.editId);
                        this.panel.webview.postMessage({
                            command: 'editResult',
                            editId: message.editId,
                            result: approveResult,
                            approved: true
                        });
                        this.updatePendingEditsCount();
                        if (approveResult.includes('✓') && this.waitingForApproval) {
                            this.waitingForApproval = false;
                            await this.continueAfterApproval();
                        }
                        break;
                    case 'rejectEdit':
                        const rejectResult = await rejectPendingEdit(message.editId);
                        this.panel.webview.postMessage({
                            command: 'editResult',
                            editId: message.editId,
                            result: rejectResult,
                            approved: false
                        });
                        this.updatePendingEditsCount();
                        break;
                    case 'approveAllEdits':
                        const approveAllResult = await applyAllPendingEdits();
                        this.panel.webview.postMessage({
                            command: 'bulkEditResult',
                            result: approveAllResult,
                            approved: true
                        });
                        this.updatePendingEditsCount();
                        break;
                    case 'rejectAllEdits':
                        const rejectAllResult = rejectAllPendingEdits();
                        this.panel.webview.postMessage({
                            command: 'bulkEditResult',
                            result: rejectAllResult,
                            approved: false
                        });
                        this.updatePendingEditsCount();
                        break;
                    case 'setAutoApprove':
                        this.autoApproveMode = message.enabled;
                        if (this.autoApproveMode && this.waitingForApproval) {
                            // Hemen bekleyen editleri onayla
                            await applyAllPendingEdits();
                            this.waitingForApproval = false;
                            this.updatePendingEditsCount();
                            await this.continueAfterApproval();
                        }
                        break;
                    case 'getContext':
                        await this.handleGetContext(message.type, message.value);
                        break;
                    case 'openFile':
                        this.openFile(message.path, message.line);
                        break;
                }
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, memoryService: MemoryService): ChatPanel {
        const column = vscode.ViewColumn.Beside;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.panel.reveal(column);
            return ChatPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'localaiChat',
            'LocalAI',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, memoryService);
        return ChatPanel.currentPanel;
    }

    public stopGeneration(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.waitingForApproval = false;
        hideGeneratingStatus();
        this.panel.webview.postMessage({ command: 'endResponse' });
    }

    private async initSession(): Promise<void> {
        const existingSession = await this.memory.loadCurrentSession();
        if (existingSession) {
            this.currentSession = existingSession;
            this.messages = existingSession.messages;
            this.selectedModel = existingSession.model;
        } else {
            this.currentSession = await this.memory.createNewSession(this.selectedModel);
        }
    }

    private async loadSession(sessionId: string): Promise<void> {
        const sessions = await this.memory.getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
            this.messages = session.messages;
            this.selectedModel = session.model;
            this.panel.webview.postMessage({
                command: 'loadedSession',
                session: { id: session.id, title: session.title, model: session.model, messageCount: session.messages.length },
                messages: session.messages.filter(m => m.role === 'user' || m.role === 'assistant')
            });
        }
    }

    private async sendSessionList(): Promise<void> {
        const sessions = await this.memory.getAllSessions();
        this.panel.webview.postMessage({
            command: 'sessionList',
            sessions: sessions.map(s => ({
                id: s.id, title: s.title, model: s.model,
                messageCount: s.messages.length, updatedAt: s.updatedAt
            })),
            currentSessionId: this.currentSession?.id
        });
    }

    private async saveCurrentSession(): Promise<void> {
        if (this.currentSession) {
            this.currentSession.messages = this.messages;
            this.currentSession.model = this.selectedModel;
            await this.memory.saveSession(this.currentSession);
        }
    }

    private updatePendingEditsCount(): void {
        this.panel.webview.postMessage({
            command: 'pendingEditsCount',
            count: getPendingEditsCount()
        });
    }

    private async handleGetContext(type: string, value: string): Promise<void> {
        let content = '';
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        try {
            if (type === 'special') {
                if (value === '@selection') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        content = editor.document.getText(editor.selection) || '(No text selected)';
                    }
                } else if (value === '@file') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        content = `File: ${editor.document.fileName}\n${'─'.repeat(40)}\n${editor.document.getText()}`;
                    }
                } else if (value === '@errors') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
                        content = diagnostics.length > 0
                            ? diagnostics.map(d => `Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'Error' : 'Warning'}] ${d.message}`).join('\n')
                            : '(No errors in current file)';
                    }
                }
            } else if (type === 'file' && workspaceRoot) {
                const filePath = value.replace('@file:', '');
                const fullPath = require('path').join(workspaceRoot, filePath);
                const fs = require('fs');
                if (fs.existsSync(fullPath)) {
                    content = `File: ${filePath}\n${'─'.repeat(40)}\n${fs.readFileSync(fullPath, 'utf-8')}`;
                }
            }
        } catch (error) {
            content = `(Error: ${error instanceof Error ? error.message : 'Unknown'})`;
        }

        this.panel.webview.postMessage({ command: 'contextData', value, content });
    }

    private async openFile(filePath: string, line?: number): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        const fullPath = vscode.Uri.file(
            filePath.startsWith('/') || filePath.includes(':') ? filePath : `${workspaceRoot}/${filePath}`
        );

        try {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(doc);
            if (line && line > 0) {
                const position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        } catch {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    private getActiveProvider(): AIProvider {
        return this.currentProvider === 'vllm' ? this.vllm : this.ollama;
    }

    private async sendModelList(): Promise<void> {
        const provider = this.getActiveProvider();
        try {
            const models = await provider.listModels();
            const toolCapable = ['llama3.1', 'llama3.2', 'llama3.3', 'mistral', 'qwen', 'coder'];
            if (models.length > 0 && !this.selectedModel) {
                this.selectedModel = models.find(m => toolCapable.some(tc => m.toLowerCase().includes(tc))) || models[0];
            }
            this.panel.webview.postMessage({
                command: 'modelList', models, selectedModel: this.selectedModel, provider: this.currentProvider
            });
        } catch (error) {
            const errorText = this.currentProvider === 'ollama'
                ? 'Ollama bağlantısı kurulamadı. ollama serve çalışıyor mu?'
                : 'vLLM bağlantısı kurulamadı. Server çalışıyor mu?';
            this.panel.webview.postMessage({
                command: 'error',
                text: errorText
            });
        }
    }

    private async handleUserMessage(text: string, context?: Array<{type: string; value: string; label: string; content: string}>): Promise<void> {
        let fullMessage = text;
        if (context && context.length > 0) {
            const contextParts = context.filter(c => c.content).map(c => `[${c.label}]\n${c.content}`);
            if (contextParts.length > 0) {
                fullMessage = `Context:\n${contextParts.join('\n\n')}\n\nUser request: ${text}`;
            }
        }

        this.messages.push({ role: 'user', content: fullMessage });
        await this.saveCurrentSession();

        this.panel.webview.postMessage({ command: 'addMessage', role: 'user', content: text });
        this.panel.webview.postMessage({ command: 'startResponse' });

        try {
            await this.runAgentLoop();
        } catch (error) {
            hideGeneratingStatus();
            if ((error as Error).name === 'AbortError') {
                this.panel.webview.postMessage({ command: 'appendToken', token: '\n\n*[Durduruldu]*' });
            } else {
                this.panel.webview.postMessage({ command: 'error', text: error instanceof Error ? error.message : 'Bilinmeyen hata' });
            }
            // Error durumunda endResponse gönder
            this.panel.webview.postMessage({ command: 'endResponse' });
        }
    }

    private async runAgentLoop(): Promise<void> {
        // Claude Code-style agentic loop:
        // - Soft limit: 15 iterations (safety rail)
        // - Hard limit: 30 iterations (absolute max)
        // - Natural termination: model stops calling tools
        const SOFT_LIMIT = 15; // Uyarı ver
        const HARD_LIMIT = 30; // Zorla durdur
        let iteration = 0;
        let statusUpdateInterval: NodeJS.Timeout | null = null;
        const loopStartTime = Date.now();
        const recentToolCalls: string[] = []; // Son tool çağrılarını takip et
        let progressMade = false; // İlerleme var mı?
        let softLimitWarned = false;

        this.abortController = new AbortController();

        if (!this.selectedModel) {
            throw new Error('Lütfen bir model seçin');
        }

        showGeneratingStatus(this.selectedModel);
        statusUpdateInterval = setInterval(() => {
            updateGeneratingStatus(Math.floor((Date.now() - loopStartTime) / 1000));
        }, 1000);

        try {
            while (iteration < HARD_LIMIT) {
                // Soft limit'e ulaşınca uyar ama devam et
                if (iteration === SOFT_LIMIT && !softLimitWarned) {
                    softLimitWarned = true;
                    log(`[LocalAI] ⚠️ Soft limit (${SOFT_LIMIT}) reached. Continuing up to ${HARD_LIMIT}...`);
                    this.messages.push({
                        role: 'system',
                        content: `You've used ${SOFT_LIMIT} iterations. Try to complete the task in the next ${HARD_LIMIT - SOFT_LIMIT} steps. Be more decisive.`
                    });
                }
                if (this.abortController?.signal.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }

                iteration++;
                log(`[LocalAI] Starting iteration ${iteration}/${HARD_LIMIT}`);

                // Context management: Eğer çok fazla mesaj varsa, eski tool result'ları özetle
                let messagesToSend = this.messages;
                const MESSAGE_LIMIT = 20; // Son 20 mesaj
                if (messagesToSend.length > MESSAGE_LIMIT) {
                    log(`[LocalAI] Context too long (${messagesToSend.length} messages). Compressing...`);
                    // İlk user mesajı + son 20 mesajı tut
                    const firstUserMsg = messagesToSend.find(m => m.role === 'user');
                    const recentMessages = messagesToSend.slice(-MESSAGE_LIMIT);
                    messagesToSend = firstUserMsg ? [firstUserMsg, ...recentMessages] : recentMessages;
                }

                const messagesWithSystem: OllamaMessage[] = [
                    { role: 'system', content: getSystemPrompt() },
                    ...messagesToSend
                ];

                const tools = getOllamaTools();
                const provider = this.getActiveProvider();

                log(`[LocalAI] Sending request to ${this.currentProvider} with model ${this.selectedModel}`);
                this.panel.webview.postMessage({ command: 'waitingForLLM' });
                const requestStartTime = Date.now();

                const { content, toolCalls } = await provider.chatWithTools(
                    this.selectedModel,
                    messagesWithSystem,
                    tools,
                    (token) => {
                        this.panel.webview.postMessage({ command: 'appendToken', token });
                    },
                    this.abortController.signal
                );

                const requestDuration = ((Date.now() - requestStartTime) / 1000).toFixed(1);
                log(`[LocalAI] Response received in ${requestDuration}s - content length: ${content?.length || 0}, toolCalls: ${toolCalls?.length || 0}`);

                if (toolCalls && toolCalls.length > 0) {
                    this.messages.push({ role: 'assistant', content, tool_calls: toolCalls });
                    this.panel.webview.postMessage({ command: 'endResponse' });

                    for (const toolCall of toolCalls) {
                        if (this.abortController?.signal.aborted) {
                            throw new DOMException('Aborted', 'AbortError');
                        }

                        const toolName = toolCall.function.name;
                        const toolParams = toolCall.function.arguments;

                        // Aynı tool çağrısını tekrar yapıyor mu kontrol et
                        // ÖNEMLI: edit_file ve write_file için loop detection YAPMA - bunlar retry yapabilmeli
                        const actionTools = ['edit_file', 'write_file'];
                        const shouldCheckLoop = !actionTools.includes(toolName);

                        if (shouldCheckLoop) {
                            // Signature oluştur - read_file için satır numaralarını da dahil et
                            let keyParam = '';
                            if (toolName === 'read_file') {
                                // Dosya + satır aralığı (farklı satırları okumak OK)
                                const start = toolParams.start_line || '1';
                                const end = toolParams.end_line || 'end';
                                keyParam = `${toolParams.path}:${start}-${end}`;
                            } else {
                                keyParam = toolParams.path || toolParams.pattern || toolParams.command || JSON.stringify(toolParams);
                            }
                            const toolSignature = `${toolName}:${keyParam}`;
                            const sameCallCount = recentToolCalls.filter(sig => sig === toolSignature).length;

                            // read_file ve grep için daha agresif ol - 1 kere tekrarda uyar
                            const strictTools = ['read_file', 'grep', 'search_files'];
                            const maxAllowed = strictTools.includes(toolName) ? 1 : 2;

                        if (sameCallCount >= maxAllowed) {
                            log(`[LocalAI] ⚠️  Agent stuck in loop! Same tool called ${sameCallCount + 1} times: ${toolSignature}`);

                            // Tool'a göre özel uyarı mesajı
                            let warningMessage = '';
                            if (toolName === 'read_file') {
                                warningMessage = `STOP! You already read "${toolParams.path}" ${sameCallCount + 1} times. You have the file content. Now USE edit_file to fix the error!`;
                            } else if (toolName === 'grep' || toolName === 'search_files') {
                                warningMessage = `STOP! You already searched for "${toolParams.pattern}" ${sameCallCount + 1} times. You found what you need. Now take ACTION - use read_file or edit_file!`;
                            } else if (toolName === 'list_files') {
                                warningMessage = `STOP! You already listed this directory ${sameCallCount + 1} times. You know the files. Now OPEN a file and fix the issue!`;
                            } else {
                                warningMessage = `STOP! You called ${toolName} ${sameCallCount + 1} times with same parameters. Stop analyzing, START ACTING!`;
                            }

                            this.messages.push({
                                role: 'tool',
                                content: warningMessage
                            });

                            // UI'da uyarıyı göster
                            this.panel.webview.postMessage({
                                command: 'toolCall',
                                name: 'system_warning',
                                params: { message: `⚠️ Loop detected: ${toolName}` }
                            });
                            this.panel.webview.postMessage({
                                command: 'toolResult',
                                name: 'system_warning',
                                result: `⚠️ ${warningMessage}`
                            });

                            recentToolCalls.push(toolSignature);
                            continue;
                        }

                            recentToolCalls.push(toolSignature);
                            if (recentToolCalls.length > 10) recentToolCalls.shift(); // Son 10 çağrıyı tut
                        } // shouldCheckLoop sonu

                        log(`[LocalAI] Executing tool: ${toolName} (${Object.keys(toolParams).join(', ')})`);

                        // Tool çağrısı yapılacağını bildir
                        this.panel.webview.postMessage({ command: 'toolExecuting', name: toolName });

                        const displayParams = { ...toolParams };
                        if (['write_file', 'edit_file'].includes(toolName)) {
                            if (displayParams.content) displayParams.content = `[${displayParams.content.split('\n').length} satır]`;
                            if (displayParams.new_text) displayParams.new_text = `[${displayParams.new_text.split('\n').length} satır]`;
                            if (displayParams.old_text) displayParams.old_text = `[${displayParams.old_text.split('\n').length} satır]`;
                        }

                        this.panel.webview.postMessage({ command: 'toolCall', name: toolName, params: displayParams });

                        const toolStartTime = Date.now();
                        const toolResult = await executeTool(toolName, toolParams, { autoApprove: this.autoApproveMode });
                        log(`[LocalAI] Tool ${toolName} completed in ${Date.now() - toolStartTime}ms`);

                        // İlerleme var mı kontrol et (edit/write tool'ları progress sayılır)
                        if (['write_file', 'edit_file'].includes(toolName) && !toolResult.includes('Error')) {
                            progressMade = true;
                            log(`[LocalAI] Progress made: ${toolName} succeeded`);
                        }

                        let displayResult = toolResult;
                        let snippet = '';

                        if (toolName === 'read_file') {
                            displayResult = '✓ dosya okundu';
                            // İlk 3 satırı göster
                            const lines = toolResult.split('\n').slice(0, 3);
                            snippet = lines.join('\n');
                        } else if (toolName === 'write_file') {
                            displayResult = '✓ dosya yazıldı';
                            const lines = (toolParams.content || '').split('\n').slice(0, 3);
                            snippet = lines.join('\n');
                        } else if (toolName === 'edit_file') {
                            // Edit sonucunu kontrol et - başarılı mı?
                            if (toolResult.includes('✓') || toolResult.includes('PENDING_EDIT')) {
                                displayResult = '✓ dosya düzenlendi';
                                // new_text'in ilk 3 satırını göster
                                const lines = (toolParams.new_text || '').split('\n').slice(0, 3);
                                snippet = lines.join('\n');
                            } else if (toolResult.includes('Error') || toolResult.includes('not found')) {
                                // Edit başarısız - detaylı göster
                                displayResult = `❌ Edit failed: ${toolResult.substring(0, 100)}`;
                                log(`[LocalAI] Edit failed: ${toolResult}`);
                            } else {
                                displayResult = '✓ dosya düzenlendi';
                                const lines = (toolParams.new_text || '').split('\n').slice(0, 3);
                                snippet = lines.join('\n');
                            }
                        }

                        // Tool tamamlandığını bildir (thinking indicator'ı güncelle)
                        this.panel.webview.postMessage({
                            command: 'toolCompleted',
                            name: toolName,
                            result: displayResult,
                            snippet: snippet,
                            params: toolParams
                        });
                        this.panel.webview.postMessage({ command: 'toolResult', name: toolName, result: displayResult });
                        this.messages.push({ role: 'tool', content: toolResult });

                        // Auto-approve modunda PENDING_EDIT gelmez, direkt yazılır
                        if (!this.autoApproveMode && ['write_file', 'edit_file'].includes(toolName) && toolResult.includes('PENDING_EDIT')) {
                            this.waitingForApproval = true;
                            this.lastPendingCount = getPendingEditsCount();
                            this.messages.push({ role: 'assistant', content: 'Değişiklikler diff editörde. Onaylayın veya reddedin.' });
                            await this.saveCurrentSession();
                            if (statusUpdateInterval) clearInterval(statusUpdateInterval);
                            hideGeneratingStatus();
                            this.panel.webview.postMessage({ command: 'endResponse' });
                            return;
                        }
                    }

                    this.panel.webview.postMessage({ command: 'startResponse' });
                    continue;
                } else {
                    this.messages.push({ role: 'assistant', content });
                    await this.saveCurrentSession();
                    break;
                }
            }

            // Hard limit'e ulaşıldı mı kontrol et
            if (iteration >= HARD_LIMIT) {
                log(`[LocalAI] 🛑 Hard limit (${HARD_LIMIT}) reached. Progress made: ${progressMade}`);

                if (progressMade) {
                    // İlerleme yapılmış - muhtemelen başarılı
                    this.messages.push({
                        role: 'assistant',
                        content: `I made changes to the code. Hard limit (${HARD_LIMIT} iterations) reached. If you need more modifications, let me know!`
                    });
                    this.panel.webview.postMessage({ command: 'appendToken', token: `\n\n✓ *Changes completed (${iteration} iterations).*` });
                } else {
                    // İlerleme yok - takılmış
                    this.messages.push({
                        role: 'assistant',
                        content: `⚠️ Hard limit (${HARD_LIMIT} iterations) reached without making changes. The task may be too complex or I need more specific guidance. Please break it down into smaller steps.`
                    });
                    this.panel.webview.postMessage({ command: 'appendToken', token: `\n\n⚠️ *Hard limit reached. No changes made.*` });
                }
            }
        } finally {
            if (statusUpdateInterval) clearInterval(statusUpdateInterval);
            hideGeneratingStatus();
            showReadyStatus();
            this.abortController = null;

            // Onay beklemiyorsak response'u kapat
            if (!this.waitingForApproval) {
                this.panel.webview.postMessage({ command: 'endResponse' });
            }
        }
    }

    private async continueAfterApproval(): Promise<void> {
        this.messages.push({ role: 'user', content: '[Değişiklikler onaylandı. Devam et.]' });
        this.panel.webview.postMessage({ command: 'startResponse' });
        try {
            await this.runAgentLoop();
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                this.panel.webview.postMessage({ command: 'error', text: error instanceof Error ? error.message : 'Hata' });
            }
        }
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LocalAI</title>
    <style>
        :root {
            --bg: #1e1e1e;
            --bg-light: #252526;
            --bg-lighter: #2d2d2d;
            --border: #3c3c3c;
            --text: #d4d4d4;
            --text-dim: #808080;
            --green: #4ec957;
            --cyan: #56b6c2;
            --yellow: #e5c07b;
            --red: #e06c75;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg);
            color: var(--text);
            height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 13px;
        }
        /* Header */
        .header {
            padding: 8px 12px;
            background: var(--bg-light);
            border-bottom: 1px solid var(--border);
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .header input, .header select {
            background: var(--bg-lighter);
            color: var(--text);
            border: 1px solid var(--border);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .header input { flex: 1; min-width: 120px; }
        .header select { min-width: 100px; }
        .header button {
            background: var(--bg-lighter);
            color: var(--cyan);
            border: 1px solid var(--border);
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .header button:hover { background: var(--border); }
        .model-row {
            display: flex;
            gap: 8px;
            align-items: center;
            width: 100%;
        }
        .model-label { font-size: 10px; color: var(--cyan); font-weight: bold; }
        /* Chat */
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px 16px 16px 24px;
        }
        .timeline {
            border-left: 2px solid var(--border);
            margin-left: 6px;
            padding-left: 20px;
        }
        .timeline-item {
            position: relative;
            padding-bottom: 16px;
        }
        .timeline-item:last-child { padding-bottom: 24px; }
        .timeline-dot {
            position: absolute;
            left: -27px;
            top: 4px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--bg);
            border: 2px solid var(--text-dim);
        }
        .timeline-item.user .timeline-dot {
            border-color: var(--green);
            background: var(--green);
        }
        .timeline-item.assistant .timeline-dot {
            border-color: var(--cyan);
        }
        .timeline-item.assistant.complete .timeline-dot {
            background: var(--cyan);
        }
        .timeline-item.generating .timeline-dot {
            background: var(--cyan);
            animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .timeline-item.tool .timeline-dot {
            width: 6px; height: 6px;
            left: -25px; top: 6px;
            border-color: var(--yellow);
            background: var(--yellow);
        }
        .timeline-item.error .timeline-dot {
            border-color: var(--red);
            background: var(--red);
        }
        .timeline-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
            font-size: 11px;
        }
        .timeline-sender { font-weight: 600; }
        .timeline-item.user .timeline-sender { color: var(--green); }
        .timeline-item.assistant .timeline-sender { color: var(--cyan); }
        .timeline-time { color: var(--text-dim); font-size: 10px; }
        .elapsed-time { color: var(--text-dim); font-size: 10px; }
        .elapsed-time.warning { color: var(--yellow); }
        .timeline-content {
            background: var(--bg-light);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 10px 14px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .timeline-item.user .timeline-content {
            background: #1a2e1a;
            border-color: #2d4a2d;
        }
        .timeline-item.error .timeline-content {
            background: #2e1a1a;
            border-color: #4a2d2d;
            color: var(--red);
        }
        .timeline-item.tool .timeline-content {
            background: transparent;
            border: none;
            padding: 0;
            font-size: 12px;
            color: var(--text-dim);
        }
        .timeline-item.tool { padding-bottom: 8px; }
        .timeline-item.tool-result { padding-bottom: 12px; }
        .timeline-item.tool-result .timeline-dot {
            width: 6px; height: 6px;
            left: -25px; top: 6px;
            border-color: var(--green);
            background: var(--green);
        }
        .timeline-content.tool-snippet {
            background: var(--bg-light);
            border: 1px solid var(--border);
            border-left: 2px solid var(--green);
            padding: 8px 10px;
            font-size: 11px;
        }
        .generating-content {
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
        }
        .generating-dots {
            display: inline-flex;
            gap: 3px;
        }
        .generating-dots span {
            width: 5px; height: 5px;
            background: var(--cyan);
            border-radius: 50%;
            animation: wave 1.2s ease-in-out infinite;
        }
        .generating-dots span:nth-child(2) { animation-delay: 0.15s; }
        .generating-dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes wave {
            0%, 60%, 100% { transform: scale(0.6); opacity: 0.4; }
            30% { transform: scale(1); opacity: 1; }
        }
        .tool-action { color: var(--cyan); }
        .thinking-indicator {
            color: var(--cyan);
            font-size: 12px;
            opacity: 0.8;
            animation: fadeInOut 2s ease-in-out infinite;
        }
        @keyframes fadeInOut {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }
        /* Code */
        pre {
            background: var(--bg);
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        code {
            font-family: 'Fira Code', Consolas, monospace;
            font-size: 12px;
        }
        /* Input */
        .input-section {
            padding: 12px;
            background: var(--bg);
            border-top: 1px solid var(--border);
        }
        .input-wrapper {
            display: flex;
            background: var(--bg-lighter);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px 12px;
            gap: 8px;
            align-items: flex-end;
        }
        .input-wrapper:focus-within {
            border-color: var(--cyan);
        }
        .input-section textarea {
            flex: 1;
            background: transparent;
            color: var(--text);
            border: none;
            outline: none;
            font-family: inherit;
            font-size: 13px;
            resize: none;
            min-height: 24px;
            max-height: 150px;
        }
        .input-actions {
            display: flex;
            gap: 4px;
        }
        .input-actions button {
            background: transparent;
            border: none;
            padding: 4px 8px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
        }
        .input-actions button.stop { color: var(--red); }
        .input-actions button.send { color: var(--green); }
        .input-actions button:hover { background: var(--border); }
        /* Auto-approve toggle */
        .auto-approve-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--bg-light);
            border-top: 1px solid var(--border);
            font-size: 11px;
        }
        .auto-approve-row label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            color: var(--text-dim);
        }
        .auto-approve-row input[type="checkbox"] {
            width: 14px;
            height: 14px;
            cursor: pointer;
        }
        .auto-approve-row.active label {
            color: var(--yellow);
        }
        .auto-approve-hint {
            font-size: 10px;
            color: var(--text-dim);
            margin-left: auto;
        }
    </style>
</head>
<body>
    <div class="header">
        <select id="providerSelect" title="AI Provider">
            <option value="ollama">Ollama</option>
            <option value="vllm">vLLM</option>
        </select>
        <input type="text" id="apiUrl" value="http://localhost:11434" placeholder="API URL">
        <button id="fetchBtn">Fetch</button>
        <button id="newBtn">New</button>
        <button id="historyBtn">History</button>
    </div>
    <div class="header model-row">
        <span class="model-label">MODEL:</span>
        <select id="selectedModel"><option>Loading...</option></select>
    </div>
    <div class="chat-container" id="chatContainer">
        <div class="timeline" id="chat">
            <div class="timeline-item assistant complete">
                <div class="timeline-dot"></div>
                <div class="timeline-content">LocalAI ready. How can I help?</div>
            </div>
        </div>
    </div>
    <div class="auto-approve-row" id="autoApproveRow">
        <label>
            <input type="checkbox" id="autoApproveToggle">
            <span>Auto-approve edits</span>
        </label>
        <span class="auto-approve-hint">Skip diff review for this session</span>
    </div>
    <div class="input-section">
        <div class="input-wrapper">
            <textarea id="input" rows="1" placeholder="Ask anything... (Shift+Enter for new line)"></textarea>
            <div class="input-actions">
                <button id="stopBtn" class="stop" style="display:none">■</button>
                <button id="sendBtn" class="send">↵</button>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const chat = document.getElementById('chat');
        const chatContainer = document.getElementById('chatContainer');
        const input = document.getElementById('input');
        const stopBtn = document.getElementById('stopBtn');
        const sendBtn = document.getElementById('sendBtn');
        const selectedModel = document.getElementById('selectedModel');
        const providerSelect = document.getElementById('providerSelect');
        const apiUrl = document.getElementById('apiUrl');
        const fetchBtn = document.getElementById('fetchBtn');
        const newBtn = document.getElementById('newBtn');
        const autoApproveToggle = document.getElementById('autoApproveToggle');
        const autoApproveRow = document.getElementById('autoApproveRow');

        let currentLine = null;
        let isResponding = false;

        providerSelect.onchange = () => {
            const provider = providerSelect.value;
            if (provider === 'ollama') {
                apiUrl.value = 'http://localhost:11434';
            } else if (provider === 'vllm') {
                apiUrl.value = 'http://localhost:8000';
            }
            selectedModel.innerHTML = '<option value="">loading...</option>';
            vscode.postMessage({ command: 'selectProvider', provider: provider });
        };

        fetchBtn.onclick = () => vscode.postMessage({ command: 'updateApiUrl', url: apiUrl.value.trim() });
        newBtn.onclick = () => {
            vscode.postMessage({ command: 'newSession' });
            chat.innerHTML = '<div class="timeline-item assistant complete"><div class="timeline-dot"></div><div class="timeline-content">New session started.</div></div>';
            // Reset auto-approve on new session
            autoApproveToggle.checked = false;
            autoApproveRow.classList.remove('active');
            vscode.postMessage({ command: 'setAutoApprove', enabled: false });
        };
        autoApproveToggle.onchange = () => {
            const enabled = autoApproveToggle.checked;
            autoApproveRow.classList.toggle('active', enabled);
            vscode.postMessage({ command: 'setAutoApprove', enabled });
        };
        stopBtn.onclick = () => vscode.postMessage({ command: 'stopGeneration' });
        sendBtn.onclick = send;
        selectedModel.onchange = () => vscode.postMessage({ command: 'selectModel', model: selectedModel.value });

        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        };
        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 150) + 'px';
        };

        function send() {
            const text = input.value.trim();
            if (!text || isResponding) return;
            vscode.postMessage({ command: 'sendMessage', text });
            input.value = '';
            input.style.height = 'auto';
        }

        function addLine(cls, content, isHtml) {
            const item = document.createElement('div');
            item.className = 'timeline-item ' + cls + (cls === 'assistant' ? ' complete' : '');

            const dot = document.createElement('div');
            dot.className = 'timeline-dot';

            if (cls === 'user' || cls === 'assistant' || cls === 'error') {
                const header = document.createElement('div');
                header.className = 'timeline-header';
                const sender = document.createElement('span');
                sender.className = 'timeline-sender';
                sender.textContent = cls === 'user' ? 'You' : cls === 'error' ? 'Error' : 'LocalAI';
                const time = document.createElement('span');
                time.className = 'timeline-time';
                time.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                header.appendChild(sender);
                header.appendChild(time);
                item.appendChild(dot);
                item.appendChild(header);
            } else {
                item.appendChild(dot);
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'timeline-content';
            if (isHtml) contentDiv.innerHTML = content;
            else contentDiv.textContent = content;
            item.appendChild(contentDiv);

            chat.appendChild(item);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return contentDiv;
        }

        function escapeHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        function renderMd(text) {
            text = text.replace(/\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/g, (m,l,c) => '<pre><code>' + escapeHtml(c.trim()) + '</code></pre>');
            text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
            text = text.replace(/\\n/g, '<br>');
            return text;
        }

        window.onmessage = (e) => {
            const msg = e.data;
            switch(msg.command) {
                case 'modelList':
                    selectedModel.innerHTML = msg.models.map(m => '<option value="'+m+'"'+(m===msg.selectedModel?' selected':'')+'>'+m+'</option>').join('');
                    break;
                case 'addMessage':
                    addLine(msg.role, msg.content);
                    break;
                case 'startResponse':
                    isResponding = true;
                    stopBtn.style.display = 'inline';

                    var item = document.createElement('div');
                    item.className = 'timeline-item assistant generating';
                    item.id = 'current-response';

                    var dot = document.createElement('div');
                    dot.className = 'timeline-dot';

                    var header = document.createElement('div');
                    header.className = 'timeline-header';
                    header.style.display = 'none';
                    header.innerHTML = '<span class="timeline-sender">LocalAI</span><span class="timeline-time">' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + '</span>';

                    currentLine = document.createElement('div');
                    currentLine.className = 'timeline-content generating-content';
                    currentLine._raw = '';
                    currentLine.innerHTML = '<span class="thinking-indicator">💭 Düşünüyor...</span>';

                    item.appendChild(dot);
                    item.appendChild(header);
                    item.appendChild(currentLine);
                    chat.appendChild(item);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    break;
                case 'appendToken':
                    if (currentLine) {
                        if (currentLine.classList.contains('generating-content')) {
                            currentLine.classList.remove('generating-content');
                            var container = document.getElementById('current-response');
                            if (container) {
                                var hdr = container.querySelector('.timeline-header');
                                if (hdr) hdr.style.display = 'flex';
                            }
                        }
                        currentLine._raw += msg.token;
                        currentLine.innerHTML = renderMd(currentLine._raw) + '<span class="generating-dots"><span></span><span></span><span></span></span>';
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                    break;
                case 'endResponse':
                    var container = document.getElementById('current-response');
                    if (currentLine && currentLine._raw && currentLine._raw.trim()) {
                        currentLine.innerHTML = renderMd(currentLine._raw);
                        if (container) {
                            container.classList.remove('generating');
                            container.classList.add('complete');
                        }
                    } else if (container) {
                        container.remove();
                    }
                    if (container) container.removeAttribute('id');
                    isResponding = false;
                    stopBtn.style.display = 'none';
                    currentLine = null;
                    break;
                case 'toolExecuting':
                    if (currentLine && currentLine.classList.contains('generating-content')) {
                        var toolNames = {
                            'read_file': '📖 Dosya okuyor',
                            'write_file': '📝 Dosya yazıyor',
                            'edit_file': '✏️ Dosya düzenliyor',
                            'list_files': '📁 Dosyaları listeleniyor',
                            'grep': '🔍 Arama yapıyor',
                            'run_terminal_command': '💻 Komut çalıştırıyor'
                        };
                        var statusText = toolNames[msg.name] || '🔧 ' + msg.name;
                        currentLine.innerHTML = '<span class="thinking-indicator">' + statusText + '...</span>';
                    }
                    break;
                case 'toolCompleted':
                    // Thinking indicator'ı güncelle
                    if (currentLine && currentLine.classList.contains('generating-content')) {
                        var completedNames = {
                            'read_file': '✓ Dosya okundu',
                            'write_file': '✓ Dosya yazıldı',
                            'edit_file': '✓ Dosya düzenlendi',
                            'list_files': '✓ Dosyalar listelendi',
                            'grep': '✓ Arama tamamlandı',
                            'run_terminal_command': '✓ Komut çalıştırıldı'
                        };
                        var completedText = completedNames[msg.name] || '✓ ' + msg.name;
                        currentLine.innerHTML = '<span class="thinking-indicator" style="color: var(--green)">' + completedText + '</span>';
                    }

                    // Code snippet göster (eğer varsa)
                    if (msg.snippet && msg.snippet.trim()) {
                        var snippetItem = document.createElement('div');
                        snippetItem.className = 'timeline-item tool-result';

                        var snippetDot = document.createElement('div');
                        snippetDot.className = 'timeline-dot';

                        var snippetContent = document.createElement('div');
                        snippetContent.className = 'timeline-content tool-snippet';

                        var fileName = msg.params?.path || 'file';
                        var header = document.createElement('div');
                        header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;color:var(--text-dim);font-size:11px;';
                        header.innerHTML = '<span style="color:var(--green)">✓</span><span>' + escapeHtml(fileName) + '</span>';

                        var codeBlock = document.createElement('pre');
                        codeBlock.style.cssText = 'margin:0;padding:8px;background:var(--bg);border-radius:4px;font-size:11px;overflow-x:auto;max-height:120px;';
                        var code = document.createElement('code');
                        code.textContent = msg.snippet;
                        codeBlock.appendChild(code);

                        snippetContent.appendChild(header);
                        snippetContent.appendChild(codeBlock);
                        snippetItem.appendChild(snippetDot);
                        snippetItem.appendChild(snippetContent);

                        chat.appendChild(snippetItem);
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                    break;
                case 'waitingForLLM':
                    if (currentLine && currentLine.classList.contains('generating-content')) {
                        currentLine.innerHTML = '<span class="thinking-indicator">⏳ Waiting for LLM response...</span>';
                    }
                    break;
                case 'toolCall':
                    var toolDesc = {'read_file':'📖 Reading','write_file':'📝 Writing','edit_file':'✏️ Editing','list_files':'📁 Listing','search_files':'🔍 Searching','run_terminal_command':'💻 Running'}[msg.name] || '🔧 ' + msg.name;
                    var detail = msg.params?.path || msg.params?.pattern || msg.params?.command || '';
                    if (detail.length > 40) detail = detail.substring(0,40) + '...';
                    addLine('tool', '<span class="tool-action">' + toolDesc + '</span>' + (detail ? ': ' + escapeHtml(detail) : ''), true);
                    break;
                case 'toolResult':
                    break;
                case 'error':
                    isResponding = false;
                    stopBtn.style.display = 'none';
                    var container = document.getElementById('current-response');
                    if (container) container.remove();
                    currentLine = null;
                    addLine('error', msg.text);
                    break;
            }
        };

        setTimeout(() => vscode.postMessage({ command: 'ready' }), 300);
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        ChatPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) d.dispose();
        }
    }
}
