import * as vscode from 'vscode';
import { OllamaService, OllamaMessage, ToolCall, OllamaTool } from './ollama';
import { VllmService } from './vllmService';
import { getOllamaTools, getSystemPrompt, executeTool, applyPendingEdit, rejectPendingEdit, applyAllPendingEdits, rejectAllPendingEdits, getPendingEditsCount, onPendingEditsChanged } from './tools';
import { MemoryService, ChatSession } from './memory';
import { showGeneratingStatus, updateGeneratingStatus, hideGeneratingStatus, showReadyStatus } from './extension';

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
    private agentModel: string = '';
    private coderModel: string = '';
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
                    case 'selectAgentModel':
                        this.agentModel = message.model;
                        break;
                    case 'selectCoderModel':
                        this.coderModel = message.model;
                        break;
                    case 'selectProvider':
                       this.currentProvider = message.provider as ProviderType;
                        // Reset models so sendModelList() will pick correct defaults for new provider
                        this.agentModel = '';
                        this.coderModel = '';

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
            this.currentSession.model = this.agentModel;
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
            const toolCapable = ['llama3.1', 'llama3.2', 'llama3.3', 'mistral'];
            if (models.length > 0 && !this.agentModel) {
                this.agentModel = models.find(m => toolCapable.some(tc => m.toLowerCase().includes(tc))) || models[0];
            }
            if (models.length > 0 && !this.coderModel) {
                this.coderModel = models.find(m => m.toLowerCase().includes('coder') || m.toLowerCase().includes('qwen')) || '';
            }
            this.panel.webview.postMessage({
                command: 'modelList', models, agentModel: this.agentModel, coderModel: this.coderModel, provider: this.currentProvider
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
        }

        if (!this.waitingForApproval) {
            this.panel.webview.postMessage({ command: 'endResponse' });
        }
    }

    private async runAgentLoop(): Promise<void> {
        const maxIterations = 10;
        let iteration = 0;
        let statusUpdateInterval: NodeJS.Timeout | null = null;
        const loopStartTime = Date.now();

        this.abortController = new AbortController();

        const activeAgentModel = this.agentModel || this.coderModel;
        if (!activeAgentModel) {
            throw new Error('Lütfen en az bir model seçin');
        }

        showGeneratingStatus(activeAgentModel);
        statusUpdateInterval = setInterval(() => {
            updateGeneratingStatus(Math.floor((Date.now() - loopStartTime) / 1000));
        }, 1000);

        try {
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
                const provider = this.getActiveProvider();

                const { content, toolCalls } = await provider.chatWithTools(
                    activeAgentModel,
                    messagesWithSystem,
                    tools,
                    (token) => {
                        this.panel.webview.postMessage({ command: 'appendToken', token });
                    },
                    this.abortController.signal
                );

                if (toolCalls && toolCalls.length > 0) {
                    this.messages.push({ role: 'assistant', content, tool_calls: toolCalls });
                    this.panel.webview.postMessage({ command: 'endResponse' });

                    for (const toolCall of toolCalls) {
                        if (this.abortController?.signal.aborted) {
                            throw new DOMException('Aborted', 'AbortError');
                        }

                        const toolName = toolCall.function.name;
                        let toolParams = toolCall.function.arguments;

                        // Coder model için kod üretimi
                        const needsCodeGeneration = ['write_file', 'edit_file'].includes(toolName)
                            && this.coderModel && this.coderModel !== this.agentModel
                            && (!toolParams.content || toolParams.content.length < 50);

                        if (needsCodeGeneration) {
                            this.panel.webview.postMessage({ command: 'startCodeGeneration', coderModel: this.coderModel });
                            const codeContent = await this.generateCodeWithCoderModel(toolName, toolParams);
                            if (codeContent) toolParams = { ...toolParams, content: codeContent };
                            this.panel.webview.postMessage({ command: 'endCodeGeneration' });
                        }

                        const displayParams = { ...toolParams };
                        if (['write_file', 'edit_file'].includes(toolName)) {
                            if (displayParams.content) displayParams.content = `[${displayParams.content.split('\n').length} satır]`;
                            if (displayParams.new_text) displayParams.new_text = `[${displayParams.new_text.split('\n').length} satır]`;
                            if (displayParams.old_text) displayParams.old_text = `[${displayParams.old_text.split('\n').length} satır]`;
                        }

                        this.panel.webview.postMessage({ command: 'toolCall', name: toolName, params: displayParams });

                        const toolResult = await executeTool(toolName, toolParams);

                        let displayResult = toolResult;
                        if (toolName === 'read_file') displayResult = '✓ dosya okundu';
                        else if (toolName === 'write_file') displayResult = '✓ dosya yazıldı';
                        else if (toolName === 'edit_file') displayResult = '✓ dosya düzenlendi';

                        this.panel.webview.postMessage({ command: 'toolResult', name: toolName, result: displayResult });
                        this.messages.push({ role: 'tool', content: toolResult });

                        if (['write_file', 'edit_file'].includes(toolName) && toolResult.includes('PENDING_EDIT')) {
                            // Auto-approve modunda ise hemen onayla ve devam et
                            if (this.autoApproveMode) {
                                await applyAllPendingEdits();
                                this.updatePendingEditsCount();
                                this.panel.webview.postMessage({
                                    command: 'toolResult',
                                    name: toolName,
                                    result: '✓ otomatik onaylandı'
                                });
                                continue;
                            }

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
        } finally {
            if (statusUpdateInterval) clearInterval(statusUpdateInterval);
            hideGeneratingStatus();
            showReadyStatus();
            this.abortController = null;
        }
    }

    private async generateCodeWithCoderModel(toolName: string, params: Record<string, string>): Promise<string | null> {
        if (!this.coderModel) return null;

        const userMessages = this.messages.filter(m => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';

        const coderPrompt = toolName === 'edit_file'
            ? `Edit code based on: ${lastUserMessage}\nFile: ${params.path}\nOld text: ${params.old_text}\nProvide ONLY the new code.`
            : `Generate code for: ${lastUserMessage}\nFile: ${params.path}\nProvide ONLY the file content.`;

        try {
            const codeResult = await this.getActiveProvider().chatWithTools(
                this.coderModel,
                [{ role: 'user', content: coderPrompt }],
                [],
                () => {},
                this.abortController?.signal
            );

            let cleanCode = codeResult.content.trim();
            const codeBlockMatch = cleanCode.match(/```[\w]*\n([\s\S]*?)```/);
            if (codeBlockMatch) cleanCode = codeBlockMatch[1].trim();
            return cleanCode;
        } catch {
            return null;
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
        <span class="model-label">AGENT:</span>
        <select id="agentModel"><option>Loading...</option></select>
        <span class="model-label">CODER:</span>
        <select id="coderModel"><option>Optional</option></select>
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
        const agentModel = document.getElementById('agentModel');
        const coderModel = document.getElementById('coderModel');
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
            agentModel.innerHTML = '<option value="">loading...</option>';
            coderModel.innerHTML = '<option value="">loading...</option>';
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
        agentModel.onchange = () => vscode.postMessage({ command: 'selectAgentModel', model: agentModel.value });
        coderModel.onchange = () => vscode.postMessage({ command: 'selectCoderModel', model: coderModel.value });

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
                    agentModel.innerHTML = msg.models.map(m => '<option value="'+m+'"'+(m===msg.agentModel?' selected':'')+'>'+m+'</option>').join('');
                    coderModel.innerHTML = '<option value="">None</option>' + msg.models.map(m => '<option value="'+m+'"'+(m===msg.coderModel?' selected':'')+'>'+m+'</option>').join('');
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
