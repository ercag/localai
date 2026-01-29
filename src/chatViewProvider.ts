import * as vscode from 'vscode';
import { OllamaService, OllamaMessage } from './ollama';
import { getOllamaTools, getSystemPrompt, executeTool, applyPendingEdit, rejectPendingEdit, applyAllPendingEdits, rejectAllPendingEdits, getPendingEditsCount, onPendingEditsChanged } from './tools';
import { MemoryService, ChatSession } from './memory';
import { showGeneratingStatus, updateGeneratingStatus, hideGeneratingStatus, showReadyStatus } from './extension';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'localai.chatView';
    private view?: vscode.WebviewView;
    private ollama: OllamaService;
    private messages: OllamaMessage[] = [];
    private agentModel: string = '';  // Tool calling için (llama3.1 gibi)
    private coderModel: string = '';  // Kod üretimi için (qwen2.5 gibi)
    private abortController: AbortController | null = null;
    private memory: MemoryService;
    private currentSession: ChatSession | null = null;
    private waitingForApproval: boolean = false;  // Agent onay bekliyor mu?
    private lastPendingCount: number = 0;  // Son pending edit sayısı

    constructor(private readonly extensionUri: vscode.Uri, memoryService: MemoryService) {
        this.ollama = new OllamaService();
        this.memory = memoryService;

        // Pending edit değişikliklerini dinle (VSCode toolbar'dan onay için)
        onPendingEditsChanged(() => {
            const currentCount = getPendingEditsCount();
            console.log('[LocalAI] Pending edits changed:', {
                waitingForApproval: this.waitingForApproval,
                lastCount: this.lastPendingCount,
                currentCount
            });
            // Eğer agent onay bekliyordu ve pending count azaldıysa (onaylandı), devam et
            if (this.waitingForApproval && currentCount < this.lastPendingCount) {
                console.log('[LocalAI] Edit approved, continuing...');
                this.waitingForApproval = false;
                this.continueAfterApproval();
            }
            this.lastPendingCount = currentCount;
            this.updatePendingEditsCount();
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this.handleUserMessage(message.text, message.context);
                    break;
                case 'selectAgentModel':
                    this.agentModel = message.model;
                    break;
                case 'selectCoderModel':
                    this.coderModel = message.model;
                    break;
                case 'getModels':
                    await this.sendModelList();
                    break;
                case 'updateApiUrl':
                    console.log('[LocalAI] updateApiUrl:', message.url);
                    this.ollama.setBaseUrl(message.url);
                    await this.sendModelList();
                    break;
                case 'clearChat':
                    this.messages = [];
                    await this.memory.clearCurrentMessages();
                    break;
                case 'newSession':
                    this.messages = [];
                    this.currentSession = await this.memory.createNewSession(this.agentModel);
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
                case 'exportHistory':
                    await this.exportHistory();
                    break;
                case 'getContext':
                    await this.handleGetContext(message.type, message.value);
                    break;
                case 'listFiles':
                    await this.handleListFiles();
                    break;
                case 'stopGeneration':
                    this.stopGeneration();
                    break;
                case 'openFile':
                    this.openFile(message.path, message.line);
                    break;
                case 'ready':
                    // Auto-fetch models on startup
                    await this.sendModelList();
                    // Load or create session
                    await this.initSession();
                    await this.sendSessionList();
                    // If session has messages, show them
                    if (this.currentSession && this.messages.length > 0) {
                        this.view?.webview.postMessage({
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
                    // Send project files for autocomplete
                    await this.sendProjectFiles();
                    break;
                case 'approveEdit':
                    const approveResult = await applyPendingEdit(message.editId);
                    this.view?.webview.postMessage({
                        command: 'editResult',
                        editId: message.editId,
                        result: approveResult,
                        approved: true
                    });
                    this.updatePendingEditsCount();
                    // Onaylandıktan sonra agent'a devam etmesini söyle
                    if (approveResult.includes('✓') && this.waitingForApproval) {
                        this.waitingForApproval = false;
                        await this.continueAfterApproval();
                    }
                    break;
                case 'rejectEdit':
                    const rejectResult = await rejectPendingEdit(message.editId);
                    this.view?.webview.postMessage({
                        command: 'editResult',
                        editId: message.editId,
                        result: rejectResult,
                        approved: false
                    });
                    this.updatePendingEditsCount();
                    break;
                case 'approveAllEdits':
                    const approveAllResult = await applyAllPendingEdits();
                    this.view?.webview.postMessage({
                        command: 'bulkEditResult',
                        result: approveAllResult,
                        approved: true
                    });
                    this.updatePendingEditsCount();
                    break;
                case 'rejectAllEdits':
                    const rejectAllResult = rejectAllPendingEdits();
                    this.view?.webview.postMessage({
                        command: 'bulkEditResult',
                        result: rejectAllResult,
                        approved: false
                    });
                    this.updatePendingEditsCount();
                    break;
            }
        });
    }

    public stopGeneration(): void {
        console.log('[LocalAI] Stop generation requested');
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        // Reset waiting state
        this.waitingForApproval = false;
        // Status bar'ı temizle
        hideGeneratingStatus();
        // Notify UI
        this.view?.webview.postMessage({ command: 'endResponse' });
        this.view?.webview.postMessage({
            command: 'appendToken',
            token: '\n\n[Durduruldu]'
        });
    }

    private async initSession(): Promise<void> {
        // Try to load existing session or create new one
        const existingSession = await this.memory.loadCurrentSession();
        if (existingSession) {
            this.currentSession = existingSession;
            this.messages = existingSession.messages;
            this.agentModel = existingSession.model;
        } else {
            this.currentSession = await this.memory.createNewSession(this.agentModel);
        }
    }

    private async loadSession(sessionId: string): Promise<void> {
        const sessions = await this.memory.getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
            this.messages = session.messages;
            this.agentModel = session.model;

            // Send messages to UI
            this.view?.webview.postMessage({
                command: 'loadedSession',
                session: {
                    id: session.id,
                    title: session.title,
                    model: session.model,
                    messageCount: session.messages.length
                },
                messages: session.messages.filter(m => m.role === 'user' || m.role === 'assistant')
            });
        }
    }

    private async sendSessionList(): Promise<void> {
        if (!this.view) return;
        const sessions = await this.memory.getAllSessions();
        this.view.webview.postMessage({
            command: 'sessionList',
            sessions: sessions.map(s => ({
                id: s.id,
                title: s.title,
                model: s.model,
                messageCount: s.messages.length,
                updatedAt: s.updatedAt
            })),
            currentSessionId: this.currentSession?.id
        });
    }

    private async exportHistory(): Promise<void> {
        const json = await this.memory.exportHistory();
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('localai-history.json'),
            filters: { 'JSON': ['json'] }
        });
        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
            vscode.window.showInformationMessage('Chat history exported successfully');
        }
    }

    private async saveCurrentSession(): Promise<void> {
        if (this.currentSession) {
            this.currentSession.messages = this.messages;
            this.currentSession.model = this.agentModel;
            await this.memory.saveSession(this.currentSession);
        }
    }

    private async handleGetContext(type: string, value: string): Promise<void> {
        if (!this.view) return;

        let content = '';
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        try {
            switch (type) {
                case 'special':
                    if (value === '@selection') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const selection = editor.selection;
                            content = editor.document.getText(selection);
                            if (!content) content = '(No text selected)';
                        }
                    } else if (value === '@file') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            content = editor.document.getText();
                            const fileName = editor.document.fileName;
                            content = `File: ${fileName}\n${'─'.repeat(40)}\n${content}`;
                        }
                    } else if (value === '@terminal') {
                        // Get last terminal output - limited API access
                        content = '(Terminal output capture requires terminal integration)';
                    } else if (value === '@errors') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
                            if (diagnostics.length > 0) {
                                content = diagnostics.map(d =>
                                    `Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'Error' : 'Warning'}] ${d.message}`
                                ).join('\n');
                            } else {
                                content = '(No errors in current file)';
                            }
                        }
                    }
                    break;

                case 'file':
                    const filePath = value.replace('@file:', '');
                    if (workspaceRoot) {
                        const fullPath = require('path').join(workspaceRoot, filePath);
                        const fs = require('fs');
                        if (fs.existsSync(fullPath)) {
                            content = fs.readFileSync(fullPath, 'utf-8');
                            content = `File: ${filePath}\n${'─'.repeat(40)}\n${content}`;
                        } else {
                            content = `(File not found: ${filePath})`;
                        }
                    }
                    break;
            }
        } catch (error) {
            content = `(Error getting context: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }

        this.view.webview.postMessage({
            command: 'contextData',
            value,
            content
        });
    }

    private async handleListFiles(): Promise<void> {
        if (!this.view) return;

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            this.view.webview.postMessage({
                command: 'filesList',
                files: ['(No workspace open)']
            });
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const files: string[] = [];
        const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '__pycache__', '.vscode'];

        function walk(dir: string, prefix: string = '') {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.')) continue;
                    if (ignoreDirs.includes(entry.name)) continue;

                    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

                    if (entry.isDirectory()) {
                        files.push(`📁 ${relPath}/`);
                        if (files.length < 200) {
                            walk(path.join(dir, entry.name), relPath);
                        }
                    } else {
                        files.push(`📄 ${relPath}`);
                    }

                    if (files.length >= 200) break;
                }
            } catch {}
        }

        walk(workspaceRoot);

        // Also send project files for autocomplete
        const projectFiles = files
            .filter(f => f.startsWith('📄'))
            .map(f => f.replace('📄 ', ''));

        this.view.webview.postMessage({
            command: 'filesList',
            files
        });

        this.view.webview.postMessage({
            command: 'projectFiles',
            files: projectFiles
        });
    }

    private updatePendingEditsCount(): void {
        if (!this.view) return;
        this.view.webview.postMessage({
            command: 'pendingEditsCount',
            count: getPendingEditsCount()
        });
    }

    private async sendProjectFiles(): Promise<void> {
        if (!this.view) return;

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        const fs = require('fs');
        const path = require('path');
        const files: string[] = [];
        const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '__pycache__', '.vscode'];

        function walk(dir: string, prefix: string = '') {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.')) continue;
                    if (ignoreDirs.includes(entry.name)) continue;

                    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

                    if (entry.isDirectory()) {
                        if (files.length < 100) {
                            walk(path.join(dir, entry.name), relPath);
                        }
                    } else {
                        files.push(relPath);
                    }

                    if (files.length >= 100) break;
                }
            } catch {}
        }

        walk(workspaceRoot);

        this.view.webview.postMessage({
            command: 'projectFiles',
            files
        });
    }

    private async openFile(filePath: string, line?: number): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        const fullPath = vscode.Uri.file(
            filePath.startsWith('/') || filePath.includes(':')
                ? filePath
                : `${workspaceRoot}/${filePath}`
        );

        try {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(doc);

            if (line && line > 0) {
                const position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    private async sendModelList(): Promise<void> {
        if (!this.view) return;
        console.log('[LocalAI] sendModelList called, URL:', this.ollama.getCurrentUrl());
        try {
            const models = await this.ollama.listModels();
            console.log('[LocalAI] Models received:', models);

            // Agent model için otomatik seçim (tool capable modelleri tercih et)
            if (models.length > 0 && !this.agentModel) {
                const toolCapable = ['llama3.1', 'llama3.2', 'llama3.3', 'mistral'];
                const autoAgent = models.find(m => toolCapable.some(tc => m.toLowerCase().includes(tc)));
                this.agentModel = autoAgent || models[0];
            }

            // Coder model için otomatik seçim (coder modelleri tercih et)
            if (models.length > 0 && !this.coderModel) {
                const coderModels = models.find(m => m.toLowerCase().includes('coder') || m.toLowerCase().includes('qwen'));
                this.coderModel = coderModels || '';
            }

            this.view.webview.postMessage({
                command: 'modelList',
                models,
                agentModel: this.agentModel,
                coderModel: this.coderModel
            });
            if (models.length === 0) {
                this.view.webview.postMessage({
                    command: 'error',
                    text: 'No models found. Run: ollama pull llama3.1:8b'
                });
            }
        } catch (error) {
            console.error('[LocalAI] Error fetching models:', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            let userMessage = 'Ollama connection failed';

            if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch')) {
                userMessage = 'Cannot connect to Ollama. Is it running? (ollama serve)';
            } else if (errorMsg.includes('404')) {
                userMessage = 'Ollama API not found. Check the URL.';
            } else {
                userMessage = `Connection error: ${errorMsg}`;
            }

            this.view.webview.postMessage({
                command: 'error',
                text: userMessage
            });
            this.view.webview.postMessage({
                command: 'fetchComplete'
            });
        }
    }

    private async handleUserMessage(text: string, context?: Array<{type: string; value: string; label: string; content: string}>): Promise<void> {
        if (!this.view) return;

        // Build message with context
        let fullMessage = text;
        if (context && context.length > 0) {
            const contextParts = context
                .filter(c => c.content)
                .map(c => `[${c.label}]\n${c.content}`);
            if (contextParts.length > 0) {
                fullMessage = `Context:\n${contextParts.join('\n\n')}\n\nUser request: ${text}`;
            }
        }

        this.messages.push({ role: 'user', content: fullMessage });
        await this.saveCurrentSession();

        this.view.webview.postMessage({
            command: 'addMessage',
            role: 'user',
            content: text
        });

        this.view.webview.postMessage({
            command: 'startResponse'
        });

        try {
            await this.runAgentLoop();
        } catch (error) {
            // Hata durumunda status bar'ı temizle
            hideGeneratingStatus();

            if ((error as Error).name === 'AbortError') {
                this.view.webview.postMessage({
                    command: 'appendToken',
                    token: '\n\n*[Generation stopped]*'
                });
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
                this.view.webview.postMessage({
                    command: 'error',
                    text: errorMessage
                });
            }
        }

        // Eğer approval beklemiyorsak endResponse gönder
        // (approval beklerken runAgentLoop içinde zaten gönderiliyor)
        if (!this.waitingForApproval) {
            this.view.webview.postMessage({ command: 'endResponse' });
        }
    }

    private async runAgentLoop(): Promise<void> {
        if (!this.view) return;

        const maxIterations = 10;
        let iteration = 0;
        let statusUpdateInterval: NodeJS.Timeout | null = null;
        const loopStartTime = Date.now();

        this.abortController = new AbortController();

        // Agent model yoksa coder model kullan, o da yoksa hata
        const activeAgentModel = this.agentModel || this.coderModel;
        if (!activeAgentModel) {
            throw new Error('Lütfen en az bir model seçin');
        }

        // Status bar'ı göster ve güncelleme başlat
        showGeneratingStatus(activeAgentModel);
        statusUpdateInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - loopStartTime) / 1000);
            updateGeneratingStatus(elapsed);
        }, 1000);

        while (iteration < maxIterations) {
            if (this.abortController?.signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            iteration++;

            const messagesWithSystem: OllamaMessage[] = [
                { role: 'system', content: getSystemPrompt() },
                ...this.messages
            ];

            const tools = getOllamaTools();

            // Agent model ile tool calling yap
            const { content, toolCalls } = await this.ollama.chatWithTools(
                activeAgentModel,
                messagesWithSystem,
                tools,
                (token) => {
                    this.view?.webview.postMessage({
                        command: 'appendToken',
                        token
                    });
                },
                this.abortController.signal
            );

            if (toolCalls && toolCalls.length > 0) {
                this.messages.push({
                    role: 'assistant',
                    content: content,
                    tool_calls: toolCalls
                });

                this.view.webview.postMessage({ command: 'endResponse' });

                // Agent'ın düşüncelerini göster (tool call'dan önceki reasoning)
                if (content && content.trim()) {
                    this.view.webview.postMessage({
                        command: 'agentThinking',
                        text: content.trim()
                    });
                }

                for (const toolCall of toolCalls) {
                    if (this.abortController?.signal.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }

                    const toolName = toolCall.function.name;
                    let toolParams = toolCall.function.arguments;

                    // Kod üretimi gerektiren tool'lar için coder model kullan
                    // Sadece content yoksa veya çok kısaysa coder model'e git
                    const codeGenerationTools = ['write_file', 'edit_file'];
                    const needsCodeGeneration = codeGenerationTools.includes(toolName)
                        && this.coderModel
                        && this.coderModel !== this.agentModel
                        && (!toolParams.content || toolParams.content.length < 50);  // Agent zaten content vermişse skip

                    if (needsCodeGeneration) {
                        // Coder model ile kod üretimi başlıyor - UI'da "generating" göster
                        this.view?.webview.postMessage({ command: 'startCodeGeneration', coderModel: this.coderModel });

                        // Coder model'e kod ürettir
                        const codeContent = await this.generateCodeWithCoderModel(toolName, toolParams);
                        if (codeContent) {
                            toolParams = { ...toolParams, content: codeContent };
                        }

                        // Kod üretimi bitti
                        this.view?.webview.postMessage({ command: 'endCodeGeneration' });
                    }

                    // Tool call'ı UI'a gönder (write_file/edit_file için HTML içerebilecek parametreleri gizle)
                    const displayParams = { ...toolParams };
                    if (toolName === 'write_file' || toolName === 'edit_file') {
                        // Content'i kısalt veya gizle (HTML render edilmesin)
                        if (displayParams.content) {
                            const lines = displayParams.content.split('\n').length;
                            displayParams.content = `[${lines} satır kod]`;
                        }
                        if (displayParams.new_text) {
                            const lines = displayParams.new_text.split('\n').length;
                            displayParams.new_text = `[${lines} satır kod]`;
                        }
                        if (displayParams.old_text) {
                            const lines = displayParams.old_text.split('\n').length;
                            displayParams.old_text = `[${lines} satır - değiştirilecek]`;
                        }
                    }

                    this.view.webview.postMessage({
                        command: 'toolCall',
                        name: toolName,
                        params: displayParams
                    });

                    const toolResult = await executeTool(toolName, toolParams);

                    // read_file, write_file ve edit_file sonuçlarını UI'da kısalt
                    let displayResult = toolResult;
                    if (toolName === 'read_file') {
                        displayResult = '✓ dosya okundu';
                    } else if (toolName === 'write_file') {
                        displayResult = '✓ dosya yazıldı';
                    } else if (toolName === 'edit_file') {
                        displayResult = '✓ dosya düzenlendi';
                    }

                    this.view.webview.postMessage({
                        command: 'toolResult',
                        name: toolName,
                        result: displayResult
                    });

                    this.messages.push({
                        role: 'tool',
                        content: toolResult
                    });

                    // write_file veya edit_file başarılıysa loop'u kır
                    // Kullanıcının onaylaması gerekiyor, agent beklememeli
                    if ((toolName === 'write_file' || toolName === 'edit_file') && toolResult.includes('PENDING_EDIT')) {
                        // Loop'u kır - dosya yazıldı, kullanıcı onayı bekleniyor
                        this.waitingForApproval = true;
                        this.lastPendingCount = getPendingEditsCount();
                        console.log('[LocalAI] Waiting for approval, pendingCount:', this.lastPendingCount);
                        this.messages.push({
                            role: 'assistant',
                            content: 'Dosya değişiklikleri diff editörde gösteriliyor. Lütfen değişiklikleri inceleyin ve onaylayın veya reddedin.'
                        });
                        await this.saveCurrentSession();
                        // Status bar ve interval temizle
                        if (statusUpdateInterval) {
                            clearInterval(statusUpdateInterval);
                        }
                        hideGeneratingStatus();
                        // UI'a response bitti bildir
                        this.view?.webview.postMessage({ command: 'endResponse' });
                        return;  // Loop'tan çık
                    }
                }

                this.view.webview.postMessage({ command: 'startResponse' });
                continue;
            } else {
                this.messages.push({ role: 'assistant', content: content });
                await this.saveCurrentSession();
                break;
            }
        }

        // Status bar'ı gizle ve interval'i temizle
        if (statusUpdateInterval) {
            clearInterval(statusUpdateInterval);
        }
        hideGeneratingStatus();
        showReadyStatus();

        this.abortController = null;
    }

    // Coder model ile kod üret
    private async generateCodeWithCoderModel(toolName: string, params: Record<string, string>): Promise<string | null> {
        if (!this.coderModel) return null;

        // Son kullanıcı mesajını ve bağlamı al
        const userMessages = this.messages.filter(m => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';

        // Dosya içeriği varsa bağlam olarak ekle
        const existingContent = params.old_text || '';

        const coderPrompt = toolName === 'edit_file'
            ? `You are an expert coder. Edit the following code based on the user's request.

User request: ${lastUserMessage}

Current code to modify:
\`\`\`
${existingContent}
\`\`\`

File: ${params.path}
Old text to replace: ${params.old_text}

Provide ONLY the new replacement code (new_text). Do not include explanations, just the code.`
            : `You are an expert coder. Generate code for the following request.

User request: ${lastUserMessage}

File to create/write: ${params.path}

Provide ONLY the complete file content. Do not include explanations or markdown code blocks, just the raw code.`;

        try {
            // Abort signal kontrolü
            if (this.abortController?.signal.aborted) {
                return null;
            }

            const codeResult = await this.ollama.chatWithTools(
                this.coderModel,
                [{ role: 'user', content: coderPrompt }],
                [],  // No tools for code generation
                (token) => {
                    // İsteğe bağlı: kod üretimini stream et
                },
                this.abortController?.signal  // Pass abort signal
            );

            // Markdown code block varsa temizle
            let cleanCode = codeResult.content.trim();
            const codeBlockMatch = cleanCode.match(/```[\w]*\n([\s\S]*?)```/);
            if (codeBlockMatch) {
                cleanCode = codeBlockMatch[1].trim();
            }

            return cleanCode;
        } catch (error) {
            console.error('[LocalAI] Coder model error:', error);
            return null;
        }
    }

    // Kullanıcı edit'i onayladıktan sonra agent'ın devam etmesini sağla
    private async continueAfterApproval(): Promise<void> {
        console.log('[LocalAI] continueAfterApproval called');
        if (!this.view) {
            console.log('[LocalAI] No view, returning');
            return;
        }

        // Agent'a değişikliğin onaylandığını bildir ve devam etmesini iste
        this.messages.push({
            role: 'user',
            content: '[Değişiklikler onaylandı. Kaldığın yerden devam et. Bir sonraki adıma geç.]'
        });

        // UI'a göster
        this.view.webview.postMessage({
            command: 'agentThinking',
            text: 'Devam ediliyor...'
        });

        // UI'da response başladığını göster
        this.view.webview.postMessage({ command: 'startResponse' });

        // Agent'ı tekrar çalıştır
        console.log('[LocalAI] Running agent loop after approval');
        try {
            await this.runAgentLoop();
            console.log('[LocalAI] Agent loop completed after approval');
        } catch (error) {
            console.log('[LocalAI] Agent loop error after approval:', error);
            if (error instanceof DOMException && error.name === 'AbortError') {
                this.view.webview.postMessage({ command: 'endResponse' });
            } else {
                console.error('[LocalAI] Continue error:', error);
                this.view.webview.postMessage({
                    command: 'error',
                    text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <style>
        :root {
            --term-green: #4ec957;
            --term-blue: #5ca1e8;
            --term-yellow: #e5c07b;
            --term-red: #e06c75;
            --term-cyan: #56b6c2;
            --term-dim: #5c6370;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
            background: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 13px;
            line-height: 1.4;
        }
        .config-section {
            padding: 8px 12px;
            background: #252526;
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            gap: 8px;
            align-items: center;
            font-size: 12px;
            flex-wrap: wrap;
        }
        .config-section input, .config-section select {
            background: #3c3c3c;
            color: #d4d4d4;
            border: 1px solid #4a4a4a;
            padding: 4px 8px;
            font-family: inherit;
            font-size: 11px;
        }
        .config-section input { flex: 1; min-width: 100px; }
        .model-section {
            padding: 6px 12px;
            background: #1e1e1e;
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            gap: 8px;
            align-items: center;
            font-size: 11px;
        }
        .model-section select {
            background: #3c3c3c;
            color: #d4d4d4;
            border: 1px solid #4a4a4a;
            padding: 3px 6px;
            font-family: inherit;
            font-size: 11px;
            flex: 1;
            min-width: 80px;
        }
        .model-label {
            font-size: 9px;
            color: var(--term-cyan);
            font-weight: bold;
        }
        .config-section button {
            background: transparent;
            color: var(--term-cyan);
            border: 1px solid var(--term-cyan);
            padding: 3px 10px;
            cursor: pointer;
            font-family: inherit;
            font-size: 11px;
        }
        .config-section button:hover {
            background: var(--term-cyan);
            color: #1e1e1e;
        }
        .capabilities-bar {
            padding: 6px 12px;
            background: #1a1a1a;
            border-bottom: 1px solid #2d2d2d;
            display: flex;
            gap: 12px;
            align-items: center;
            font-size: 10px;
            color: var(--term-dim);
            overflow-x: auto;
        }
        .capability {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            padding: 2px 6px;
            background: #252526;
            border-radius: 3px;
            cursor: help;
            opacity: 0.4;
            transition: all 0.2s;
        }
        .capability.active {
            opacity: 1;
            background: #2d4a3e;
            color: var(--term-green);
        }
        .capability.active .icon {
            filter: none;
        }
        .capability:hover {
            background: #3c3c3c;
            opacity: 0.8;
        }
        .capability.active:hover {
            background: #3d5a4e;
            opacity: 1;
        }
        .capability .icon {
            font-size: 11px;
        }
        .capabilities-bar .status {
            margin-left: auto;
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 3px;
        }
        .capabilities-bar .status.supported {
            background: #2d4a3e;
            color: var(--term-green);
        }
        .capabilities-bar .status.unsupported {
            background: #4a2d2d;
            color: var(--term-red);
        }
        .capabilities-bar .status.unknown {
            background: #3c3c3c;
            color: var(--term-dim);
        }
        .history-panel {
            position: absolute;
            top: 45px;
            right: 10px;
            background: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            width: 280px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 100;
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .history-panel.show { display: block; }
        .history-header {
            padding: 8px 12px;
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: var(--term-cyan);
        }
        .history-header button {
            background: transparent;
            border: none;
            color: var(--term-dim);
            cursor: pointer;
            font-size: 11px;
        }
        .history-header button:hover { color: var(--term-cyan); }
        .session-item {
            padding: 8px 12px;
            border-bottom: 1px solid #2d2d2d;
            cursor: pointer;
            font-size: 11px;
        }
        .session-item:hover { background: #2d2d2d; }
        .session-item.active { background: #3c3c3c; border-left: 2px solid var(--term-green); }
        .session-title {
            color: #d4d4d4;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .session-meta {
            color: var(--term-dim);
            font-size: 10px;
            display: flex;
            justify-content: space-between;
        }
        .session-delete {
            color: var(--term-dim);
            cursor: pointer;
            padding: 2px 4px;
        }
        .session-delete:hover { color: var(--term-red); }
        /* Autocomplete dropdown for @ mentions */
        .autocomplete-dropdown {
            position: absolute;
            bottom: 50px;
            left: 12px;
            right: 12px;
            background: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
            display: none;
            z-index: 100;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
        }
        .autocomplete-dropdown.show { display: block; }
        .autocomplete-item {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .autocomplete-item:hover, .autocomplete-item.selected {
            background: #3c3c3c;
        }
        .autocomplete-item .icon {
            color: var(--term-cyan);
            width: 16px;
        }
        .autocomplete-item .label {
            color: #d4d4d4;
        }
        .autocomplete-item .desc {
            color: var(--term-dim);
            font-size: 11px;
            margin-left: auto;
        }
        /* Context chips */
        .context-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            padding: 4px 12px;
            background: #252526;
            border-bottom: 1px solid #3c3c3c;
        }
        .context-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: #3c3c3c;
            border-radius: 3px;
            font-size: 11px;
            color: var(--term-cyan);
        }
        .context-chip .remove {
            cursor: pointer;
            color: var(--term-dim);
        }
        .context-chip .remove:hover {
            color: var(--term-red);
        }
        .context-chips:empty { display: none; }
        /* Bulk actions bar for pending edits */
        .bulk-actions {
            display: none;
            padding: 6px 12px;
            background: #2d2d2d;
            border-bottom: 1px solid #3c3c3c;
            gap: 8px;
            align-items: center;
            font-size: 11px;
        }
        .bulk-actions.show { display: flex; }
        .bulk-actions .count {
            color: var(--term-yellow);
            margin-right: auto;
        }
        .bulk-actions button {
            padding: 3px 10px;
            font-family: inherit;
            font-size: 11px;
            cursor: pointer;
            border: none;
            border-radius: 3px;
        }
        .bulk-actions .approve-all {
            background: var(--term-green);
            color: #1e1e1e;
        }
        .bulk-actions .reject-all {
            background: transparent;
            color: var(--term-dim);
            border: 1px solid var(--term-dim);
        }
        .bulk-actions .reject-all:hover {
            color: var(--term-red);
            border-color: var(--term-red);
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 12px 16px 12px 20px;
            font-size: 13px;
        }
        /* Timeline layout */
        .timeline {
            position: relative;
            border-left: 2px solid #3c3c3c;
            margin-left: 6px;
            padding-left: 16px;
        }
        /* Timeline item */
        .timeline-item {
            position: relative;
            padding-bottom: 16px;
        }
        .timeline-item:last-child {
            padding-bottom: 0;
        }
        /* Timeline dot - centered on the border line */
        .timeline-dot {
            position: absolute;
            left: -22px;
            top: 2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #1e1e1e;
            border: 2px solid var(--term-dim);
        }
        .timeline-item.user .timeline-dot {
            border-color: var(--term-green);
            background: var(--term-green);
        }
        .timeline-item.assistant .timeline-dot {
            border-color: var(--term-cyan);
        }
        .timeline-item.assistant.complete .timeline-dot {
            background: var(--term-cyan);
        }
        .timeline-item.tool .timeline-dot {
            width: 6px;
            height: 6px;
            left: -20px;
            top: 5px;
            border-color: var(--term-yellow);
            background: var(--term-yellow);
        }
        .timeline-item.error .timeline-dot {
            border-color: var(--term-red);
            background: var(--term-red);
        }
        /* Generating dot - simple opacity pulse, no size change */
        .timeline-item.generating .timeline-dot {
            background: var(--term-cyan);
            animation: dot-pulse 1s ease-in-out infinite;
        }
        @keyframes dot-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }
        /* Timeline header */
        .timeline-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
            font-size: 11px;
            flex-wrap: wrap;
        }
        .timeline-sender {
            font-weight: 600;
        }
        .timeline-item.user .timeline-sender {
            color: var(--term-green);
        }
        .timeline-item.assistant .timeline-sender {
            color: var(--term-cyan);
        }
        .timeline-time {
            color: var(--term-dim);
            font-size: 10px;
        }
        /* Timeline content */
        .timeline-content {
            background: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 6px;
            padding: 10px 14px;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.5;
            color: #d4d4d4;
        }
        .timeline-item.user .timeline-content {
            background: #1a2e1a;
            border-color: #2d4a2d;
        }
        .timeline-item.error .timeline-content {
            background: #2e1a1a;
            border-color: #4a2d2d;
            color: var(--term-red);
        }
        /* Tool items - compact inline */
        .timeline-item.tool {
            padding-bottom: 8px;
        }
        .timeline-item.tool .timeline-content {
            background: transparent;
            border: none;
            padding: 0;
            font-size: 12px;
            color: var(--term-dim);
        }
        .tool-action {
            color: var(--term-cyan);
        }
        .tool-detail {
            color: var(--term-dim);
            opacity: 0.8;
        }
        .tool-result {
            color: var(--term-green);
            margin-left: 8px;
            font-size: 11px;
        }
        /* Agent thinking - inline */
        .timeline-item.thinking {
            padding-bottom: 8px;
        }
        .timeline-item.thinking .timeline-dot {
            width: 6px;
            height: 6px;
            left: -20px;
            top: 5px;
            border-color: var(--term-dim);
            background: var(--term-dim);
        }
        .timeline-item.thinking .timeline-content {
            background: transparent;
            border: none;
            padding: 0;
            font-size: 11px;
            color: var(--term-dim);
            font-style: italic;
        }
        /* Legacy support */
        .line {
            margin: 2px 0;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .line.user {
            color: var(--term-green);
        }
        .line.assistant {
            color: #d4d4d4;
        }
        .line.error {
            color: var(--term-red);
        }
        .line.tool {
            color: var(--term-dim);
            font-size: 12px;
            padding-left: 8px;
            border-left: 2px solid var(--term-yellow);
            margin-left: 32px;
            padding-top: 2px;
            padding-bottom: 2px;
        }
        .line.tool .tool-action {
            color: var(--term-cyan);
        }
        .line.tool .tool-detail {
            color: var(--term-dim);
            margin-left: 4px;
        }
        .line.agent-thinking {
            color: var(--term-dim);
            font-size: 11px;
            font-style: italic;
            padding-left: 8px;
            margin: 4px 0 4px 32px;
            opacity: 0.8;
        }
        .line.agent-thinking .thinking-icon {
            margin-right: 4px;
        }
        .line.tool-result {
            color: var(--term-dim);
            font-size: 11px;
            max-height: 150px;
            overflow-y: auto;
            margin-left: 32px;
            padding: 6px 10px;
            background: #1a1a1a;
            border-radius: 4px;
        }
        .diff-container {
            background: #1a1a1a;
            border: 1px solid #3c3c3c;
            border-radius: 4px;
            margin: 8px 0;
            overflow: hidden;
        }
        .diff-header {
            background: #252526;
            padding: 6px 10px;
            font-size: 12px;
            color: var(--term-cyan);
            border-bottom: 1px solid #3c3c3c;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .diff-content {
            padding: 8px;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
        }
        .diff-line {
            white-space: pre;
            font-family: inherit;
        }
        .diff-line.removed {
            background: rgba(255, 80, 80, 0.15);
            color: #e06c75;
        }
        .diff-line.added {
            background: rgba(80, 200, 80, 0.15);
            color: #98c379;
        }
        .diff-line.context {
            color: #5c6370;
        }
        .diff-actions {
            display: flex;
            gap: 8px;
            padding: 8px 10px;
            background: #252526;
            border-top: 1px solid #3c3c3c;
        }
        .diff-actions button {
            padding: 4px 12px;
            font-family: inherit;
            font-size: 11px;
            cursor: pointer;
            border: none;
        }
        .diff-actions .approve {
            background: var(--term-green);
            color: #1e1e1e;
        }
        .diff-actions .approve:hover {
            background: #5fd068;
        }
        .diff-actions .reject {
            background: transparent;
            color: var(--term-dim);
            border: 1px solid var(--term-dim);
        }
        .diff-actions .reject:hover {
            color: var(--term-red);
            border-color: var(--term-red);
        }
        .line a, .file-link {
            color: var(--term-blue);
            text-decoration: underline;
            cursor: pointer;
        }
        pre {
            background: #252526;
            padding: 8px;
            margin: 4px 0;
            overflow-x: auto;
            font-size: 12px;
            border-left: 2px solid var(--term-cyan);
        }
        code {
            font-family: inherit;
            background: #2d2d2d;
            padding: 1px 4px;
        }
        pre code {
            background: none;
            padding: 0;
        }
        .input-section {
            padding: 12px;
            background: #1e1e1e;
            border-top: 1px solid #3c3c3c;
        }
        .input-wrapper {
            display: flex;
            background: #2d2d2d;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 8px 12px;
            gap: 8px;
            align-items: flex-end;
        }
        .input-wrapper:focus-within {
            border-color: var(--term-cyan);
            box-shadow: 0 0 0 1px var(--term-cyan);
        }
        .input-section textarea {
            flex: 1;
            background: transparent;
            color: #d4d4d4;
            border: none;
            outline: none;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.5;
            resize: none;
            min-height: 24px;
            max-height: 200px;
            overflow-y: auto;
        }
        .input-section textarea::placeholder {
            color: var(--term-dim);
            opacity: 0.7;
        }
        .input-actions {
            display: flex;
            gap: 4px;
            align-items: center;
        }
        .input-actions button {
            background: transparent;
            color: var(--term-dim);
            border: none;
            cursor: pointer;
            font-family: inherit;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
            transition: all 0.15s;
        }
        .input-actions button:hover {
            background: #3c3c3c;
            color: var(--term-cyan);
        }
        .input-actions button.stop {
            color: var(--term-red);
        }
        .input-actions button.stop:hover {
            background: rgba(224, 108, 117, 0.2);
        }
        .input-actions button.send {
            color: var(--term-green);
        }
        .input-actions button.send:hover {
            background: rgba(78, 201, 87, 0.2);
        }
        .generating {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            vertical-align: middle;
        }
        .generating span {
            display: inline-block;
            width: 5px;
            height: 5px;
            background: var(--term-cyan);
            border-radius: 50%;
            animation: wave 1.2s ease-in-out infinite;
        }
        .generating > .timeline-header {
            display: none;
        }            
        .generating span:nth-child(1) { animation-delay: 0s; }
        .generating span:nth-child(2) { animation-delay: 0.15s; }
        .generating span:nth-child(3) { animation-delay: 0.3s; }
        /* Generating content - minimal style when only spinner */
        .timeline-content.generating-content {
            background: transparent;
            border: none;
            padding: 2px 0;
        }
        @keyframes wave {
            0%, 60%, 100% {
                transform: scale(0.6);
                opacity: 0.4;
            }
            30% {
                transform: scale(1);
                opacity: 1;
            }
        }
        .generating-bar {
            display: inline-block;
            width: 60px;
            height: 3px;
            background: #3c3c3c;
            border-radius: 2px;
            margin-left: 8px;
            overflow: hidden;
            vertical-align: middle;
        }
        .generating-bar::after {
            content: '';
            display: block;
            width: 30px;
            height: 100%;
            background: linear-gradient(90deg, var(--term-green), var(--term-cyan));
            border-radius: 2px;
            animation: slide 1s ease-in-out infinite;
        }
        @keyframes slide {
            0% { transform: translateX(-30px); }
            100% { transform: translateX(60px); }
        }
        .hljs { background: transparent !important; }
        .elapsed-time {
            color: var(--term-dim);
            font-size: 11px;
            margin-left: 8px;
            font-style: italic;
        }
        .elapsed-time.timeout-warning {
            color: var(--term-yellow);
            animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    </style>
</head>
<body>
    <div class="config-section">
        <input type="text" id="apiUrl" placeholder="http://localhost:11434" value="http://localhost:11434">
        <button id="fetchBtn">fetch</button>
        <button id="newBtn">new</button>
        <button id="historyBtn">history</button>
    </div>
    <div class="model-section">
        <span class="model-label">AGENT:</span>
        <select id="agentModelSelect" title="Tool calling için model"><option value="">select...</option></select>
        <span class="model-label">CODER:</span>
        <select id="coderModelSelect" title="Kod üretimi için model"><option value="">select...</option></select>
    </div>
    <div class="capabilities-bar" id="capabilitiesBar">
        <span style="color:#666;">Tools:</span>
        <span class="capability" id="cap-read" title="Read file contents"><span class="icon">📖</span> read</span>
        <span class="capability" id="cap-write" title="Write/create files (with diff preview)"><span class="icon">📝</span> write</span>
        <span class="capability" id="cap-edit" title="Edit files (with diff preview)"><span class="icon">✏️</span> edit</span>
        <span class="capability" id="cap-list" title="List directory contents"><span class="icon">📁</span> list</span>
        <span class="capability" id="cap-grep" title="Search in files"><span class="icon">🔍</span> grep</span>
        <span class="capability" id="cap-terminal" title="Run terminal commands"><span class="icon">▶</span> terminal</span>
        <span class="status unknown" id="toolStatus">select model</span>
    </div>
    <div class="history-panel" id="historyPanel">
        <div class="history-header">
            <span>Chat History</span>
            <div>
                <button id="exportBtn">export</button>
                <button id="closeHistoryBtn">close</button>
            </div>
        </div>
        <div id="sessionList"></div>
    </div>
    <div class="chat-container" id="chatContainer">
        <div class="timeline" id="chat">
            <div class="timeline-item assistant complete">
                <div class="timeline-dot"></div>
                <div class="timeline-content">LocalAI ready. Type a command or ask a question.</div>
            </div>
        </div>
    </div>
    <div class="bulk-actions" id="bulkActions">
        <span class="count"><span id="pendingCount">0</span> pending edit(s)</span>
        <button class="approve-all" onclick="approveAllEdits()">✓ Apply All</button>
        <button class="reject-all" onclick="rejectAllEdits()">✗ Reject All</button>
    </div>
    <div class="context-chips" id="contextChips"></div>
    <div class="autocomplete-dropdown" id="autocomplete"></div>
    <div class="input-section">
        <div class="input-wrapper">
            <textarea id="input" rows="1" placeholder="Ask anything... (@ for context, / for commands)&#10;Shift+Enter for new line"></textarea>
            <div class="input-actions">
                <button id="stopBtn" class="stop" style="display:none" title="Stop generation">■</button>
                <button id="sendBtn" class="send" title="Send (Enter)">↵</button>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const stopBtn = document.getElementById('stopBtn');
        const agentModelSelect = document.getElementById('agentModelSelect');
        const coderModelSelect = document.getElementById('coderModelSelect');
        const apiUrl = document.getElementById('apiUrl');
        const fetchBtn = document.getElementById('fetchBtn');
        const newBtn = document.getElementById('newBtn');
        const historyBtn = document.getElementById('historyBtn');
        const historyPanel = document.getElementById('historyPanel');
        const sessionList = document.getElementById('sessionList');
        const exportBtn = document.getElementById('exportBtn');
        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        const autocomplete = document.getElementById('autocomplete');
        const contextChips = document.getElementById('contextChips');
        const bulkActions = document.getElementById('bulkActions');
        const pendingCount = document.getElementById('pendingCount');

        let currentLine = null;
        let isResponding = false;
        let currentSessionId = null;
        let contextItems = [];
        let autocompleteIndex = 0;
        let pendingEditsCount = 0;
        let autocompleteItems = [];
        let projectFiles = [];
        let toolsSupported = false;
        let responseStartTime = null;
        let elapsedTimeInterval = null;
        let timeoutWarningShown = false;
        const RESPONSE_TIMEOUT = 60000; // 60 saniye

        // Tool support'u gösteren modeller (bilinen tool-capable modeller)
        const toolCapableModels = [
            'llama3.1', 'llama3.2', 'llama3.3',
            'qwen2.5', 'qwen2.5-coder',
            'mistral', 'mixtral',
            'command-r', 'command-r-plus',
            'gemma2',
            'phi3', 'phi4',
            'deepseek-coder-v2',
            'firefunction',
            'hermes3'
        ];

        function updateToolStatus() {
            const status = document.getElementById('toolStatus');
            const capabilities = document.querySelectorAll('.capability');
            const agentModel = agentModelSelect.value;
            const coderModel = coderModelSelect.value;

            if ((!agentModel || agentModel === 'agent...') && (!coderModel || coderModel === 'coder...')) {
                status.textContent = 'select models';
                status.className = 'status unknown';
                capabilities.forEach(cap => cap.classList.remove('active'));
                toolsSupported = false;
                return;
            }

            // Agent model tool-capable mi kontrol et
            const agentLower = (agentModel || '').toLowerCase();
            const isAgentCapable = toolCapableModels.some(m => agentLower.includes(m));

            const hasCoderModel = coderModel && coderModel !== 'coder...';

            if (isAgentCapable) {
                status.textContent = hasCoderModel ? 'agent+coder' : 'tools ready';
                status.className = 'status supported';
                capabilities.forEach(cap => cap.classList.add('active'));
                toolsSupported = true;
            } else if (hasCoderModel) {
                status.textContent = 'coder only';
                status.className = 'status supported';
                capabilities.forEach(cap => cap.classList.add('active'));
                toolsSupported = true;
            } else {
                status.textContent = 'no tools';
                status.className = 'status unsupported';
                capabilities.forEach(cap => cap.classList.remove('active'));
                toolsSupported = false;
            }
        }

        agentModelSelect.onchange = () => {
            vscode.postMessage({ command: 'selectAgentModel', model: agentModelSelect.value });
            updateToolStatus();
        };

        coderModelSelect.onchange = () => {
            vscode.postMessage({ command: 'selectCoderModel', model: coderModelSelect.value });
            updateToolStatus();
        };

        fetchBtn.onclick = () => {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '...';
            vscode.postMessage({ command: 'updateApiUrl', url: apiUrl.value.trim() });
        };

        // Auto-fetch models on load
        setTimeout(() => {
            if (apiUrl.value.trim()) {
                fetchBtn.disabled = true;
                fetchBtn.textContent = '...';
                vscode.postMessage({ command: 'ready' });
            }
        }, 500);

        stopBtn.onclick = () => {
            vscode.postMessage({ command: 'stopGeneration' });
        };

        const sendBtn = document.getElementById('sendBtn');
        sendBtn.onclick = () => send();

        // Auto-resize textarea
        function autoResizeTextarea() {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        }

        input.onkeydown = (e) => {
            if (autocomplete.classList.contains('show')) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    autocompleteIndex = Math.min(autocompleteIndex + 1, autocompleteItems.length - 1);
                    updateAutocompleteSelection();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
                    updateAutocompleteSelection();
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    selectAutocompleteItem();
                } else if (e.key === 'Escape') {
                    hideAutocomplete();
                }
                return;
            }
            // Enter = send, Shift+Enter = new line
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        };

        input.oninput = () => {
            autoResizeTextarea();
            const text = input.value;
            const cursorPos = input.selectionStart;

            // Check for @ mention
            const beforeCursor = text.slice(0, cursorPos);
            const atMatch = beforeCursor.match(/@([\\w./]*)$/);

            if (atMatch) {
                const query = atMatch[1].toLowerCase();
                showMentionAutocomplete(query);
            } else {
                // Check for / command
                const slashMatch = beforeCursor.match(/^\\/([\\w]*)$/);
                if (slashMatch) {
                    const query = slashMatch[1].toLowerCase();
                    showCommandAutocomplete(query);
                } else {
                    hideAutocomplete();
                }
            }
        };

        newBtn.onclick = () => {
            vscode.postMessage({ command: 'newSession' });
            chat.innerHTML = '<div class="line assistant">New chat started.</div>';
            historyPanel.classList.remove('show');
        };

        historyBtn.onclick = () => {
            historyPanel.classList.toggle('show');
            if (historyPanel.classList.contains('show')) {
                vscode.postMessage({ command: 'getSessions' });
            }
        };

        closeHistoryBtn.onclick = () => {
            historyPanel.classList.remove('show');
        };

        exportBtn.onclick = () => {
            vscode.postMessage({ command: 'exportHistory' });
        };

        // @ Mention options
        const mentionOptions = [
            { type: 'special', value: '@selection', icon: '✂', label: '@selection', desc: 'Selected code in editor' },
            { type: 'special', value: '@file', icon: '📄', label: '@file', desc: 'Current open file' },
            { type: 'special', value: '@terminal', icon: '▶', label: '@terminal', desc: 'Last terminal output' },
            { type: 'special', value: '@errors', icon: '⚠', label: '@errors', desc: 'Current file errors' }
        ];

        // / Command options
        const commandOptions = [
            { value: '/clear', icon: '🗑', label: '/clear', desc: 'Clear chat' },
            { value: '/new', icon: '✨', label: '/new', desc: 'New session' },
            { value: '/model', icon: '🤖', label: '/model', desc: 'Change model' },
            { value: '/files', icon: '📁', label: '/files', desc: 'List project files' },
            { value: '/help', icon: '❓', label: '/help', desc: 'Show help' }
        ];

        function showMentionAutocomplete(query) {
            autocompleteItems = [];

            // Add special mentions
            mentionOptions.forEach(opt => {
                if (opt.label.toLowerCase().includes(query)) {
                    autocompleteItems.push(opt);
                }
            });

            // Add matching project files
            projectFiles.forEach(file => {
                if (file.toLowerCase().includes(query) && autocompleteItems.length < 10) {
                    autocompleteItems.push({
                        type: 'file',
                        value: '@file:' + file,
                        icon: '📄',
                        label: '@file:' + file,
                        desc: 'Include file'
                    });
                }
            });

            if (autocompleteItems.length > 0) {
                renderAutocomplete();
            } else {
                hideAutocomplete();
            }
        }

        function showCommandAutocomplete(query) {
            autocompleteItems = commandOptions.filter(cmd =>
                cmd.label.toLowerCase().includes(query)
            );

            if (autocompleteItems.length > 0) {
                renderAutocomplete();
            } else {
                hideAutocomplete();
            }
        }

        function renderAutocomplete() {
            autocompleteIndex = 0;
            autocomplete.innerHTML = autocompleteItems.map((item, i) =>
                '<div class="autocomplete-item' + (i === 0 ? ' selected' : '') + '" data-index="' + i + '">' +
                    '<span class="icon">' + item.icon + '</span>' +
                    '<span class="label">' + escapeHtml(item.label) + '</span>' +
                    '<span class="desc">' + escapeHtml(item.desc) + '</span>' +
                '</div>'
            ).join('');
            autocomplete.classList.add('show');

            // Click handler
            autocomplete.querySelectorAll('.autocomplete-item').forEach(el => {
                el.onclick = () => {
                    autocompleteIndex = parseInt(el.dataset.index);
                    selectAutocompleteItem();
                };
            });
        }

        function updateAutocompleteSelection() {
            autocomplete.querySelectorAll('.autocomplete-item').forEach((el, i) => {
                el.classList.toggle('selected', i === autocompleteIndex);
            });
        }

        function selectAutocompleteItem() {
            const item = autocompleteItems[autocompleteIndex];
            if (!item) return;

            const text = input.value;
            const cursorPos = input.selectionStart;

            // Check if it's a command or mention
            if (item.value.startsWith('/')) {
                // Execute command
                executeCommand(item.value);
                input.value = '';
            } else {
                // It's a mention - add to context
                const beforeCursor = text.slice(0, cursorPos);
                const atIndex = beforeCursor.lastIndexOf('@');
                const afterCursor = text.slice(cursorPos);

                input.value = beforeCursor.slice(0, atIndex) + afterCursor;
                addContextItem(item);
            }

            hideAutocomplete();
            input.focus();
        }

        function hideAutocomplete() {
            autocomplete.classList.remove('show');
            autocompleteItems = [];
        }

        function addContextItem(item) {
            // Check if already added
            if (contextItems.find(c => c.value === item.value)) return;

            contextItems.push(item);
            renderContextChips();

            // Request context data from extension
            vscode.postMessage({ command: 'getContext', type: item.type, value: item.value });
        }

        function removeContextItem(index) {
            contextItems.splice(index, 1);
            renderContextChips();
        }

        function renderContextChips() {
            contextChips.innerHTML = contextItems.map((item, i) =>
                '<span class="context-chip">' +
                    item.icon + ' ' + escapeHtml(item.label.replace('@', '')) +
                    '<span class="remove" onclick="removeContext(' + i + ')">✕</span>' +
                '</span>'
            ).join('');
        }

        window.removeContext = function(index) {
            removeContextItem(index);
        };

        function executeCommand(cmd) {
            switch(cmd) {
                case '/clear':
                    vscode.postMessage({ command: 'clearChat' });
                    chat.innerHTML = '<div class="line assistant">Chat cleared.</div>';
                    break;
                case '/new':
                    vscode.postMessage({ command: 'newSession' });
                    chat.innerHTML = '<div class="line assistant">New chat started.</div>';
                    contextItems = [];
                    renderContextChips();
                    break;
                case '/model':
                    agentModelSelect.focus();
                    addLine('assistant', 'Select agent and coder models from the dropdowns above.');
                    break;
                case '/files':
                    vscode.postMessage({ command: 'listFiles' });
                    break;
                case '/help':
                    showHelp();
                    break;
            }
        }

        function showHelp() {
            const help = [
                '## LocalAI Help',
                '',
                '**@ Mentions (add context):**',
                '  @selection - Add selected code',
                '  @file - Add current file',
                '  @file:path - Add specific file',
                '  @terminal - Add terminal output',
                '  @errors - Add current errors',
                '',
                '**/ Commands:**',
                '  /clear - Clear chat',
                '  /new - New session',
                '  /model - Change model',
                '  /files - List files',
                '  /help - This help'
            ].join('\\n');
            var div = addLine('assistant', '', false);
            div.innerHTML = renderMd(help);
        }

        function send() {
            const text = input.value.trim();
            if (!text || isResponding) return;

            // Gather context data
            const contextData = contextItems.map(item => ({
                type: item.type,
                value: item.value,
                label: item.label,
                content: item.content || ''
            }));

            vscode.postMessage({
                command: 'sendMessage',
                text,
                context: contextData
            });
            input.value = '';
            input.style.height = 'auto'; // Reset textarea height

            // Clear context after sending
            contextItems = [];
            renderContextChips();
        }

        function addLine(cls, content, isHtml) {
            const chatContainer = document.getElementById('chatContainer');

            // User ve assistant mesajları için timeline item
            if (cls === 'user' || cls === 'assistant') {
                const item = document.createElement('div');
                item.className = 'timeline-item ' + cls + (cls === 'user' ? '' : ' complete');

                const dot = document.createElement('div');
                dot.className = 'timeline-dot';

                const header = document.createElement('div');
                header.className = 'timeline-header';

                const sender = document.createElement('span');
                sender.className = 'timeline-sender';
                sender.textContent = cls === 'user' ? 'You' : 'LocalAI';

                const time = document.createElement('span');
                time.className = 'timeline-time';
                time.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                header.appendChild(sender);
                header.appendChild(time);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'timeline-content';
                if (isHtml) contentDiv.innerHTML = content;
                else contentDiv.textContent = content;

                item.appendChild(dot);
                item.appendChild(header);
                item.appendChild(contentDiv);
                chat.appendChild(item);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                return contentDiv;
            }

            // Error mesajları için
            if (cls === 'error') {
                const item = document.createElement('div');
                item.className = 'timeline-item error';

                const dot = document.createElement('div');
                dot.className = 'timeline-dot';

                const header = document.createElement('div');
                header.className = 'timeline-header';

                const sender = document.createElement('span');
                sender.className = 'timeline-sender';
                sender.style.color = 'var(--term-red)';
                sender.textContent = 'Error';

                header.appendChild(sender);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'timeline-content';
                contentDiv.textContent = content;

                item.appendChild(dot);
                item.appendChild(header);
                item.appendChild(contentDiv);
                chat.appendChild(item);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                return contentDiv;
            }

            // Tool mesajları için compact timeline item
            if (cls === 'tool') {
                const item = document.createElement('div');
                item.className = 'timeline-item tool';

                const dot = document.createElement('div');
                dot.className = 'timeline-dot';

                const contentDiv = document.createElement('div');
                contentDiv.className = 'timeline-content';
                if (isHtml) contentDiv.innerHTML = content;
                else contentDiv.textContent = content;

                item.appendChild(dot);
                item.appendChild(contentDiv);
                chat.appendChild(item);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                return contentDiv;
            }

            // Thinking/agent-thinking için
            if (cls === 'agent-thinking') {
                const item = document.createElement('div');
                item.className = 'timeline-item thinking';

                const dot = document.createElement('div');
                dot.className = 'timeline-dot';

                const contentDiv = document.createElement('div');
                contentDiv.className = 'timeline-content';
                if (isHtml) contentDiv.innerHTML = content;
                else contentDiv.textContent = content;

                item.appendChild(dot);
                item.appendChild(contentDiv);
                chat.appendChild(item);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                return contentDiv;
            }

            // Fallback - eski stil
            const div = document.createElement('div');
            div.className = 'line ' + cls;
            if (isHtml) div.innerHTML = content;
            else div.textContent = content;
            chat.appendChild(div);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return div;
        }

        function escapeHtml(text) {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function renderMd(text) {
            // Code blocks
            text = text.replace(/\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/g, function(m, lang, code) {
                return '<pre><code class="hljs' + (lang ? ' language-' + lang : '') + '">' + escapeHtml(code.trim()) + '</code></pre>';
            });
            // Inline code
            text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            // Bold
            text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
            // Line breaks
            text = text.replace(/\\n/g, '<br>');
            return text;
        }

        function highlightCode() {
            document.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }

        window.openFile = (path, line) => {
            vscode.postMessage({ command: 'openFile', path, line: parseInt(line) || 0 });
        };

        window.onmessage = (e) => {
            const msg = e.data;
            switch(msg.command) {
                case 'modelList':
                    fetchBtn.disabled = false;
                    fetchBtn.textContent = 'fetch';
                    if (msg.models && msg.models.length > 0) {
                        // Agent model dropdown - tool capable modelleri öne al
                        const agentOptions = '<option value="">agent...</option>' + msg.models.map(m => {
                            const isRecommended = toolCapableModels.some(tc => m.toLowerCase().includes(tc));
                            return '<option value="'+m+'"'+(m===msg.agentModel?' selected':'')+'>'+(isRecommended?'★ ':'')+m+'</option>';
                        }).join('');
                        agentModelSelect.innerHTML = agentOptions;

                        // Coder model dropdown - coding modelleri öne al
                        const coderOptions = '<option value="">coder...</option>' + msg.models.map(m => {
                            const isRecommended = m.toLowerCase().includes('coder') || m.toLowerCase().includes('code');
                            return '<option value="'+m+'"'+(m===msg.coderModel?' selected':'')+'>'+(isRecommended?'★ ':'')+m+'</option>';
                        }).join('');
                        coderModelSelect.innerHTML = coderOptions;

                        updateToolStatus();
                    } else {
                        agentModelSelect.innerHTML = '<option>no models</option>';
                        coderModelSelect.innerHTML = '<option>no models</option>';
                        updateToolStatus();
                    }
                    break;
                case 'fetchComplete':
                    fetchBtn.disabled = false;
                    fetchBtn.textContent = 'fetch';
                    break;
                case 'addMessage':
                    addLine(msg.role, msg.content);
                    break;
                case 'startResponse':
                    isResponding = true;
                    stopBtn.style.display = 'inline';
                    responseStartTime = Date.now();
                    timeoutWarningShown = false;

                    var chatContainer = document.getElementById('chatContainer');

                    // Create timeline item for assistant response
                    var timelineItem = document.createElement('div');
                    timelineItem.className = 'timeline-item assistant generating';
                    timelineItem.id = 'current-response';

                    var dot = document.createElement('div');
                    dot.className = 'timeline-dot';

                    var header = document.createElement('div');
                    header.className = 'timeline-header';
                    header.style.display = 'none'; // Hidden until text arrives

                    var sender = document.createElement('span');
                    sender.className = 'timeline-sender';
                    sender.textContent = 'LocalAI';

                    var timeSpan = document.createElement('span');
                    timeSpan.className = 'timeline-time';
                    timeSpan.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    var elapsedSpan = document.createElement('span');
                    elapsedSpan.className = 'elapsed-time';
                    elapsedSpan.textContent = '0s';

                    header.appendChild(sender);
                    header.appendChild(timeSpan);
                    header.appendChild(elapsedSpan);

                    currentLine = document.createElement('div');
                    currentLine.className = 'timeline-content generating-content';
                    currentLine._raw = '';
                    currentLine.innerHTML = '';

                    timelineItem.appendChild(dot);
                    timelineItem.appendChild(header);
                    timelineItem.appendChild(currentLine);
                    chat.appendChild(timelineItem);
                    chatContainer.scrollTop = chatContainer.scrollHeight;

                    // Elapsed time sayacını başlat
                    if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                    elapsedTimeInterval = setInterval(() => {
                        if (!isResponding || !currentLine) {
                            clearInterval(elapsedTimeInterval);
                            return;
                        }
                        const elapsed = Math.floor((Date.now() - responseStartTime) / 1000);
                        const elapsedEl = timelineItem.querySelector('.elapsed-time');
                        if (elapsedEl) {
                            elapsedEl.textContent = elapsed + 's';
                            // Timeout uyarısı
                            if (elapsed >= 60 && !timeoutWarningShown) {
                                timeoutWarningShown = true;
                                elapsedEl.classList.add('timeout-warning');
                                elapsedEl.textContent = elapsed + 's - gecikiyor';
                            }
                        }
                    }, 1000);
                    break;
                case 'appendToken':
                    if (currentLine) {
                        // İlk token geldiğinde header'ı göster ve generating-content class'ını kaldır
                        if (currentLine.classList.contains('generating-content')) {
                            currentLine.classList.remove('generating-content');
                            var respContainer = document.getElementById('current-response');
                            if (respContainer) {
                                var hdr = respContainer.querySelector('.timeline-header');
                                if (hdr) hdr.style.display = 'flex';
                            }
                        }
                        currentLine._raw += msg.token;
                        currentLine.innerHTML = renderMd(currentLine._raw) + '<span class="generating"><span></span><span></span><span></span></span>';
                        var chatCont = document.getElementById('chatContainer');
                        if (chatCont) chatCont.scrollTop = chatCont.scrollHeight;
                    }
                    break;
                case 'endResponse':
                    // Elapsed time sayacını durdur
                    if (elapsedTimeInterval) {
                        clearInterval(elapsedTimeInterval);
                        elapsedTimeInterval = null;
                    }
                    var responseContainer = document.getElementById('current-response');
                    if (currentLine) {
                        if (currentLine._raw && currentLine._raw.trim()) {
                            currentLine.innerHTML = renderMd(currentLine._raw);
                            highlightCode();
                            // Mark as complete and remove elapsed time
                            if (responseContainer) {
                                responseContainer.classList.remove('generating');
                                responseContainer.classList.add('complete');
                                var elapsedEl = responseContainer.querySelector('.elapsed-time');
                                if (elapsedEl) elapsedEl.remove();
                            }
                        } else {
                            // Remove empty message container
                            if (responseContainer) {
                                responseContainer.remove();
                            } else if (currentLine.parentElement) {
                                currentLine.parentElement.remove();
                            }
                        }
                    }
                    if (responseContainer) {
                        responseContainer.removeAttribute('id');
                    }
                    isResponding = false;
                    stopBtn.style.display = 'none';
                    currentLine = null;
                    responseStartTime = null;
                    break;
                case 'agentThinking':
                    // Agent'ın düşüncelerini göster
                    if (msg.text) {
                        var thinkingDiv = document.createElement('div');
                        thinkingDiv.className = 'line agent-thinking';
                        thinkingDiv.innerHTML = '<span class="thinking-icon">💭</span> ' + escapeHtml(msg.text.length > 150 ? msg.text.substring(0, 150) + '...' : msg.text);
                        chat.appendChild(thinkingDiv);
                        chat.scrollTop = chat.scrollHeight;
                    }
                    break;
                case 'toolCall':
                    // Tool açıklamaları
                    var toolDescriptions = {
                        'read_file': '📖 Dosya okuyor',
                        'write_file': '📝 Dosya yazıyor',
                        'edit_file': '✏️ Dosya düzenliyor',
                        'list_files': '📁 Dosyaları listiyor',
                        'search_files': '🔍 Dosyalarda arıyor',
                        'run_terminal_command': '💻 Komut çalıştırıyor',
                        'web_search': '🌐 Web araması yapıyor'
                    };
                    var toolDesc = toolDescriptions[msg.name] || '🔧 ' + msg.name;
                    var toolDetail = '';
                    if (msg.params) {
                        if (msg.name === 'read_file' && msg.params.path) {
                            toolDetail = ': ' + msg.params.path;
                        } else if (msg.name === 'write_file' && msg.params.path) {
                            toolDetail = ': ' + msg.params.path;
                        } else if (msg.name === 'edit_file' && msg.params.path) {
                            toolDetail = ': ' + msg.params.path;
                        } else if (msg.name === 'list_files' && msg.params.path) {
                            toolDetail = ': ' + msg.params.path;
                        } else if (msg.name === 'search_files' && msg.params.pattern) {
                            toolDetail = ': "' + msg.params.pattern + '"';
                        } else if (msg.name === 'run_terminal_command') {
                            var cmd = msg.params.command || msg.params.cmd || '';
                            toolDetail = ': ' + (cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd);
                        } else if (msg.name === 'web_search' && msg.params.query) {
                            toolDetail = ': "' + msg.params.query + '"';
                        }
                    }
                    addLine('tool', '<span class="tool-action">' + toolDesc + '</span><span class="tool-detail">' + escapeHtml(toolDetail) + '</span>', true);
                    break;
                case 'toolResult':
                    if (!msg.result || msg.result.trim() === '') break;

                    // Check if this is a pending edit (diff preview)
                    if (msg.result.startsWith('PENDING_EDIT:')) {
                        var lines = msg.result.split('\\n');
                        var editId = lines[0].replace('PENDING_EDIT:', '');
                        var diffContent = lines.slice(1).join('\\n');

                        var diffContainer = document.createElement('div');
                        diffContainer.className = 'diff-container';
                        diffContainer.id = 'diff-' + editId;

                        // Parse diff lines and colorize
                        var diffLines = diffContent.split('\\n').map(function(line) {
                            if (line.startsWith('- ')) {
                                return '<div class="diff-line removed">' + escapeHtml(line) + '</div>';
                            } else if (line.startsWith('+ ')) {
                                return '<div class="diff-line added">' + escapeHtml(line) + '</div>';
                            } else if (line.startsWith('──')) {
                                return '<div class="diff-line" style="color:var(--term-cyan)">' + escapeHtml(line) + '</div>';
                            } else {
                                return '<div class="diff-line context">' + escapeHtml(line) + '</div>';
                            }
                        }).join('');

                        diffContainer.innerHTML =
                            '<div class="diff-header"><span>📝 Proposed changes</span></div>' +
                            '<div class="diff-content">' + diffLines + '</div>' +
                            '<div class="diff-actions">' +
                                '<button class="approve" onclick="approveEdit(\\'' + editId + '\\')">✓ Apply</button>' +
                                '<button class="reject" onclick="rejectEdit(\\'' + editId + '\\')">✗ Reject</button>' +
                            '</div>';

                        chat.appendChild(diffContainer);
                        chat.scrollTop = chat.scrollHeight;
                    } else {
                        var resultDiv = document.createElement('div');
                        resultDiv.className = 'line tool-result';
                        resultDiv.textContent = msg.result;
                        chat.appendChild(resultDiv);
                        chat.scrollTop = chat.scrollHeight;
                    }
                    break;
                case 'editResult':
                    var diffEl = document.getElementById('diff-' + msg.editId);
                    if (diffEl) {
                        var statusDiv = document.createElement('div');
                        statusDiv.className = 'line ' + (msg.approved ? 'assistant' : 'error');
                        statusDiv.textContent = msg.result;
                        diffEl.replaceWith(statusDiv);
                    }
                    break;
                case 'error':
                    // Stop elapsed time interval
                    if (elapsedTimeInterval) {
                        clearInterval(elapsedTimeInterval);
                        elapsedTimeInterval = null;
                    }
                    // Remove generating state from current response
                    var errorResponseContainer = document.getElementById('current-response');
                    if (errorResponseContainer) {
                        errorResponseContainer.classList.remove('generating');
                        // Remove the empty generating content if exists
                        if (currentLine && (!currentLine._raw || !currentLine._raw.trim())) {
                            errorResponseContainer.remove();
                        }
                    }
                    isResponding = false;
                    stopBtn.style.display = 'none';
                    fetchBtn.disabled = false;
                    currentLine = null;
                    responseStartTime = null;
                    addLine('error', msg.text);
                    break;
                case 'sessionList':
                    currentSessionId = msg.currentSessionId;
                    renderSessionList(msg.sessions);
                    break;
                case 'loadedSession':
                    currentSessionId = msg.session.id;
                    chat.innerHTML = '';
                    if (msg.messages && msg.messages.length > 0) {
                        msg.messages.forEach(function(m) {
                            if (m.role === 'user') {
                                addLine('user', m.content);
                            } else if (m.role === 'assistant' && m.content) {
                                var div = addLine('assistant', '', false);
                                div.innerHTML = renderMd(m.content);
                            }
                        });
                        highlightCode();
                        addLine('assistant', '--- session restored ---');
                    } else {
                        addLine('assistant', 'Session loaded: ' + msg.session.title);
                    }
                    historyPanel.classList.remove('show');
                    break;
                case 'projectFiles':
                    projectFiles = msg.files || [];
                    break;
                case 'contextData':
                    // Update context item with actual content
                    var idx = contextItems.findIndex(c => c.value === msg.value);
                    if (idx >= 0) {
                        contextItems[idx].content = msg.content;
                    }
                    break;
                case 'filesList':
                    var filesText = '## Project Files\\n\\n' + (msg.files || []).slice(0, 50).join('\\n');
                    var div = addLine('assistant', '', false);
                    div.innerHTML = renderMd(filesText);
                    break;
                case 'pendingEditsCount':
                    pendingEditsCount = msg.count;
                    pendingCount.textContent = msg.count;
                    bulkActions.classList.toggle('show', msg.count > 1);
                    break;
                case 'bulkEditResult':
                    addLine(msg.approved ? 'assistant' : 'error', msg.result);
                    // Remove all diff containers
                    document.querySelectorAll('.diff-container').forEach(el => el.remove());
                    break;
                case 'startCodeGeneration':
                    // Kod üretimi başladı - spinner göster
                    var codeGenLine = document.createElement('div');
                    codeGenLine.className = 'line tool code-generation';
                    codeGenLine.id = 'codeGenIndicator';
                    codeGenLine.innerHTML = '<span class="tool-name">[' + msg.coderModel + ']</span> generating code <span class="generating"><span></span><span></span><span></span></span>';
                    chat.appendChild(codeGenLine);
                    chat.scrollTop = chat.scrollHeight;
                    break;
                case 'endCodeGeneration':
                    // Kod üretimi bitti - indicator'ı kaldır
                    var indicator = document.getElementById('codeGenIndicator');
                    if (indicator) {
                        indicator.innerHTML = '<span class="tool-name">✓</span> code generated';
                        setTimeout(() => indicator.remove(), 1000);
                    }
                    break;
            }
        };

        function renderSessionList(sessions) {
            if (!sessions || sessions.length === 0) {
                sessionList.innerHTML = '<div style="padding:12px;color:var(--term-dim);font-size:11px;">No chat history</div>';
                return;
            }
            sessionList.innerHTML = sessions.map(function(s) {
                var date = new Date(s.updatedAt);
                var timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0,5);
                var isActive = s.id === currentSessionId ? ' active' : '';
                return '<div class="session-item' + isActive + '" onclick="loadSession(\\'' + s.id + '\\')">' +
                    '<div class="session-title">' + escapeHtml(s.title) + '</div>' +
                    '<div class="session-meta">' +
                        '<span>' + s.messageCount + ' msgs · ' + (s.model || 'unknown') + '</span>' +
                        '<span class="session-delete" onclick="event.stopPropagation();deleteSession(\\'' + s.id + '\\')">✕</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        window.loadSession = function(sessionId) {
            vscode.postMessage({ command: 'loadSession', sessionId: sessionId });
        };

        window.deleteSession = function(sessionId) {
            vscode.postMessage({ command: 'deleteSession', sessionId: sessionId });
        };

        window.approveAllEdits = function() {
            vscode.postMessage({ command: 'approveAllEdits' });
        };

        window.rejectAllEdits = function() {
            vscode.postMessage({ command: 'rejectAllEdits' });
        };

        window.approveEdit = function(editId) {
            vscode.postMessage({ command: 'approveEdit', editId: editId });
        };

        window.rejectEdit = function(editId) {
            vscode.postMessage({ command: 'rejectEdit', editId: editId });
        };

        input.focus();
    </script>
</body>
</html>`;
    }
}
