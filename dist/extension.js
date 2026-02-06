/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.outputChannel = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
exports.showGeneratingStatus = showGeneratingStatus;
exports.updateGeneratingStatus = updateGeneratingStatus;
exports.hideGeneratingStatus = hideGeneratingStatus;
exports.showReadyStatus = showReadyStatus;
const vscode = __importStar(__webpack_require__(1));
const chatPanel_1 = __webpack_require__(2);
const memory_1 = __webpack_require__(10);
const tools_1 = __webpack_require__(5);
// Status bar item for showing generation status
let statusBarItem;
// Memory service (shared with ChatPanel)
let memoryService;
function activate(context) {
    // Create output channel
    exports.outputChannel = vscode.window.createOutputChannel('LocalAI');
    context.subscriptions.push(exports.outputChannel);
    exports.outputChannel.appendLine('LocalAI extension activated');
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.name = 'LocalAI Status';
    context.subscriptions.push(statusBarItem);
    // Initialize memory service
    memoryService = new memory_1.MemoryService(context);
    // Command to open chat in editor panel
    const openChatCommand = vscode.commands.registerCommand('localai.openChat', () => {
        chatPanel_1.ChatPanel.createOrShow(context.extensionUri, memoryService);
    });
    // Apply edit command (for diff editor toolbar)
    const applyEditCommand = vscode.commands.registerCommand('localai.applyEdit', async () => {
        // Önce aktif editor'dan bulmayı dene
        const activeEditor = vscode.window.activeTextEditor;
        let pendingEdit = activeEditor ? (0, tools_1.getPendingEditForFile)(activeEditor.document.uri.fsPath) : undefined;
        // Bulunamadıysa, en son pending edit'i al
        if (!pendingEdit) {
            const allEdits = (0, tools_1.getAllPendingEdits)();
            if (allEdits.length > 0) {
                pendingEdit = allEdits[allEdits.length - 1];
            }
        }
        if (pendingEdit) {
            const result = await (0, tools_1.applyPendingEdit)(pendingEdit.id);
            vscode.window.showInformationMessage(result);
            updatePendingEditContext();
        }
        else {
            vscode.window.showWarningMessage('No pending edit found');
        }
    });
    // Reject edit command (for diff editor toolbar)
    const rejectEditCommand = vscode.commands.registerCommand('localai.rejectEdit', async () => {
        // Önce aktif editor'dan bulmayı dene
        const activeEditor = vscode.window.activeTextEditor;
        let pendingEdit = activeEditor ? (0, tools_1.getPendingEditForFile)(activeEditor.document.uri.fsPath) : undefined;
        // Bulunamadıysa, en son pending edit'i al
        if (!pendingEdit) {
            const allEdits = (0, tools_1.getAllPendingEdits)();
            if (allEdits.length > 0) {
                pendingEdit = allEdits[allEdits.length - 1];
            }
        }
        if (pendingEdit) {
            const result = await (0, tools_1.rejectPendingEdit)(pendingEdit.id);
            vscode.window.showInformationMessage(result);
            updatePendingEditContext();
        }
        else {
            vscode.window.showWarningMessage('No pending edit found');
        }
    });
    // Update context when pending edits change
    function updatePendingEditContext() {
        // Herhangi bir pending edit varsa butonları göster
        const hasPending = (0, tools_1.getPendingEditsCount)() > 0;
        vscode.commands.executeCommand('setContext', 'localai.hasPendingEdit', hasPending);
    }
    // Listen to editor changes to update context
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        updatePendingEditContext();
    }));
    // Listen to pending edits changes
    context.subscriptions.push((0, tools_1.onPendingEditsChanged)(() => {
        updatePendingEditContext();
    }));
    // Stop generation command (for status bar click)
    const stopGenerationCommand = vscode.commands.registerCommand('localai.stopGeneration', () => {
        // ChatPanel'a stop mesajı gönder
        if (chatPanel_1.ChatPanel.currentPanel) {
            chatPanel_1.ChatPanel.currentPanel.stopGeneration();
        }
    });
    context.subscriptions.push(openChatCommand, applyEditCommand, rejectEditCommand, stopGenerationCommand);
}
function deactivate() {
    if (chatPanel_1.ChatPanel.currentPanel) {
        chatPanel_1.ChatPanel.currentPanel.dispose();
    }
}
// Status bar update functions
function showGeneratingStatus(model) {
    if (statusBarItem) {
        statusBarItem.text = `$(sync~spin) LocalAI: Generating...`;
        statusBarItem.tooltip = `Model: ${model}\nClick to stop`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.command = 'localai.stopGeneration';
        statusBarItem.show();
    }
}
function updateGeneratingStatus(elapsed) {
    if (statusBarItem) {
        statusBarItem.text = `$(sync~spin) LocalAI: ${elapsed}s`;
        if (elapsed >= 60) {
            statusBarItem.text = `$(warning) LocalAI: ${elapsed}s - slow response`;
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }
}
function hideGeneratingStatus() {
    if (statusBarItem) {
        statusBarItem.hide();
    }
}
function showReadyStatus() {
    if (statusBarItem) {
        statusBarItem.text = `$(check) LocalAI: Ready`;
        statusBarItem.tooltip = 'LocalAI is ready';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.command = undefined;
        statusBarItem.show();
        // 3 saniye sonra gizle
        setTimeout(() => {
            if (statusBarItem.text === '$(check) LocalAI: Ready') {
                statusBarItem.hide();
            }
        }, 3000);
    }
}


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatPanel = void 0;
exports.log = log;
const vscode = __importStar(__webpack_require__(1));
const ollama_1 = __webpack_require__(3);
const vllmService_1 = __webpack_require__(4);
const tools_1 = __webpack_require__(5);
const extension_1 = __webpack_require__(0);
function log(message) {
    if (extension_1.outputChannel) {
        extension_1.outputChannel.appendLine(message);
    }
    console.log(message);
}
class ChatPanel {
    static currentPanel;
    panel;
    extensionUri;
    ollama;
    vllm;
    currentProvider = 'ollama';
    messages = [];
    selectedModel = '';
    abortController = null;
    memory;
    currentSession = null;
    waitingForApproval = false;
    lastPendingCount = 0;
    autoApproveMode = false;
    disposables = [];
    constructor(panel, extensionUri, memoryService) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.ollama = new ollama_1.OllamaService();
        this.vllm = new vllmService_1.VllmService();
        this.memory = memoryService;
        this.panel.webview.html = this.getHtmlContent();
        // Pending edit değişikliklerini dinle
        (0, tools_1.onPendingEditsChanged)(() => {
            const currentCount = (0, tools_1.getPendingEditsCount)();
            if (this.waitingForApproval && currentCount < this.lastPendingCount) {
                this.waitingForApproval = false;
                this.continueAfterApproval();
            }
            this.lastPendingCount = currentCount;
            this.updatePendingEditsCount();
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this.handleUserMessage(message.text, message.context);
                    break;
                case 'selectModel':
                    this.selectedModel = message.model;
                    break;
                case 'selectProvider':
                    this.currentProvider = message.provider;
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
                    const approveResult = await (0, tools_1.applyPendingEdit)(message.editId);
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
                    const rejectResult = await (0, tools_1.rejectPendingEdit)(message.editId);
                    this.panel.webview.postMessage({
                        command: 'editResult',
                        editId: message.editId,
                        result: rejectResult,
                        approved: false
                    });
                    this.updatePendingEditsCount();
                    break;
                case 'approveAllEdits':
                    const approveAllResult = await (0, tools_1.applyAllPendingEdits)();
                    this.panel.webview.postMessage({
                        command: 'bulkEditResult',
                        result: approveAllResult,
                        approved: true
                    });
                    this.updatePendingEditsCount();
                    break;
                case 'rejectAllEdits':
                    const rejectAllResult = (0, tools_1.rejectAllPendingEdits)();
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
                        await (0, tools_1.applyAllPendingEdits)();
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
        }, null, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }
    static createOrShow(extensionUri, memoryService) {
        const column = vscode.ViewColumn.Beside;
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.panel.reveal(column);
            return ChatPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('localaiChat', 'LocalAI', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri]
        });
        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, memoryService);
        return ChatPanel.currentPanel;
    }
    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.waitingForApproval = false;
        (0, extension_1.hideGeneratingStatus)();
        this.panel.webview.postMessage({ command: 'endResponse' });
    }
    async initSession() {
        const existingSession = await this.memory.loadCurrentSession();
        if (existingSession) {
            this.currentSession = existingSession;
            this.messages = existingSession.messages;
            this.selectedModel = existingSession.model;
        }
        else {
            this.currentSession = await this.memory.createNewSession(this.selectedModel);
        }
    }
    async loadSession(sessionId) {
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
    async sendSessionList() {
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
    async saveCurrentSession() {
        if (this.currentSession) {
            this.currentSession.messages = this.messages;
            this.currentSession.model = this.selectedModel;
            await this.memory.saveSession(this.currentSession);
        }
    }
    updatePendingEditsCount() {
        this.panel.webview.postMessage({
            command: 'pendingEditsCount',
            count: (0, tools_1.getPendingEditsCount)()
        });
    }
    async handleGetContext(type, value) {
        let content = '';
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        try {
            if (type === 'special') {
                if (value === '@selection') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        content = editor.document.getText(editor.selection) || '(No text selected)';
                    }
                }
                else if (value === '@file') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        content = `File: ${editor.document.fileName}\n${'─'.repeat(40)}\n${editor.document.getText()}`;
                    }
                }
                else if (value === '@errors') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
                        content = diagnostics.length > 0
                            ? diagnostics.map(d => `Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'Error' : 'Warning'}] ${d.message}`).join('\n')
                            : '(No errors in current file)';
                    }
                }
            }
            else if (type === 'file' && workspaceRoot) {
                const filePath = value.replace('@file:', '');
                const fullPath = (__webpack_require__(6).join)(workspaceRoot, filePath);
                const fs = __webpack_require__(7);
                if (fs.existsSync(fullPath)) {
                    content = `File: ${filePath}\n${'─'.repeat(40)}\n${fs.readFileSync(fullPath, 'utf-8')}`;
                }
            }
        }
        catch (error) {
            content = `(Error: ${error instanceof Error ? error.message : 'Unknown'})`;
        }
        this.panel.webview.postMessage({ command: 'contextData', value, content });
    }
    async openFile(filePath, line) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return;
        const fullPath = vscode.Uri.file(filePath.startsWith('/') || filePath.includes(':') ? filePath : `${workspaceRoot}/${filePath}`);
        try {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(doc);
            if (line && line > 0) {
                const position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        }
        catch {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }
    getActiveProvider() {
        return this.currentProvider === 'vllm' ? this.vllm : this.ollama;
    }
    async sendModelList() {
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
        }
        catch (error) {
            const errorText = this.currentProvider === 'ollama'
                ? 'Ollama bağlantısı kurulamadı. ollama serve çalışıyor mu?'
                : 'vLLM bağlantısı kurulamadı. Server çalışıyor mu?';
            this.panel.webview.postMessage({
                command: 'error',
                text: errorText
            });
        }
    }
    async handleUserMessage(text, context) {
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
        }
        catch (error) {
            (0, extension_1.hideGeneratingStatus)();
            if (error.name === 'AbortError') {
                this.panel.webview.postMessage({ command: 'appendToken', token: '\n\n*[Durduruldu]*' });
            }
            else {
                this.panel.webview.postMessage({ command: 'error', text: error instanceof Error ? error.message : 'Bilinmeyen hata' });
            }
            // Error durumunda endResponse gönder
            this.panel.webview.postMessage({ command: 'endResponse' });
        }
    }
    async runAgentLoop() {
        // Claude Code-style agentic loop:
        // - Soft limit: 15 iterations (safety rail)
        // - Hard limit: 30 iterations (absolute max)
        // - Natural termination: model stops calling tools
        const SOFT_LIMIT = 15; // Uyarı ver
        const HARD_LIMIT = 30; // Zorla durdur
        let iteration = 0;
        let statusUpdateInterval = null;
        const loopStartTime = Date.now();
        const recentToolCalls = []; // Son tool çağrılarını takip et
        let progressMade = false; // İlerleme var mı?
        let softLimitWarned = false;
        this.abortController = new AbortController();
        if (!this.selectedModel) {
            throw new Error('Lütfen bir model seçin');
        }
        (0, extension_1.showGeneratingStatus)(this.selectedModel);
        statusUpdateInterval = setInterval(() => {
            (0, extension_1.updateGeneratingStatus)(Math.floor((Date.now() - loopStartTime) / 1000));
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
                const messagesWithSystem = [
                    { role: 'system', content: (0, tools_1.getSystemPrompt)() },
                    ...messagesToSend
                ];
                const tools = (0, tools_1.getOllamaTools)();
                const provider = this.getActiveProvider();
                log(`[LocalAI] Sending request to ${this.currentProvider} with model ${this.selectedModel}`);
                this.panel.webview.postMessage({ command: 'waitingForLLM' });
                const requestStartTime = Date.now();
                const { content, toolCalls } = await provider.chatWithTools(this.selectedModel, messagesWithSystem, tools, (token) => {
                    this.panel.webview.postMessage({ command: 'appendToken', token });
                }, this.abortController.signal);
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
                            }
                            else {
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
                                }
                                else if (toolName === 'grep' || toolName === 'search_files') {
                                    warningMessage = `STOP! You already searched for "${toolParams.pattern}" ${sameCallCount + 1} times. You found what you need. Now take ACTION - use read_file or edit_file!`;
                                }
                                else if (toolName === 'list_files') {
                                    warningMessage = `STOP! You already listed this directory ${sameCallCount + 1} times. You know the files. Now OPEN a file and fix the issue!`;
                                }
                                else {
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
                            if (recentToolCalls.length > 10)
                                recentToolCalls.shift(); // Son 10 çağrıyı tut
                        } // shouldCheckLoop sonu
                        log(`[LocalAI] Executing tool: ${toolName} (${Object.keys(toolParams).join(', ')})`);
                        // Tool çağrısı yapılacağını bildir
                        this.panel.webview.postMessage({ command: 'toolExecuting', name: toolName });
                        const displayParams = { ...toolParams };
                        if (['write_file', 'edit_file'].includes(toolName)) {
                            if (displayParams.content)
                                displayParams.content = `[${displayParams.content.split('\n').length} satır]`;
                            if (displayParams.new_text)
                                displayParams.new_text = `[${displayParams.new_text.split('\n').length} satır]`;
                            if (displayParams.old_text)
                                displayParams.old_text = `[${displayParams.old_text.split('\n').length} satır]`;
                        }
                        this.panel.webview.postMessage({ command: 'toolCall', name: toolName, params: displayParams });
                        const toolStartTime = Date.now();
                        const toolResult = await (0, tools_1.executeTool)(toolName, toolParams, { autoApprove: this.autoApproveMode });
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
                        }
                        else if (toolName === 'write_file') {
                            displayResult = '✓ dosya yazıldı';
                            const lines = (toolParams.content || '').split('\n').slice(0, 3);
                            snippet = lines.join('\n');
                        }
                        else if (toolName === 'edit_file') {
                            // Edit sonucunu kontrol et - başarılı mı?
                            if (toolResult.includes('✓') || toolResult.includes('PENDING_EDIT')) {
                                displayResult = '✓ dosya düzenlendi';
                                // new_text'in ilk 3 satırını göster
                                const lines = (toolParams.new_text || '').split('\n').slice(0, 3);
                                snippet = lines.join('\n');
                            }
                            else if (toolResult.includes('Error') || toolResult.includes('not found')) {
                                // Edit başarısız - detaylı göster
                                displayResult = `❌ Edit failed: ${toolResult.substring(0, 100)}`;
                                log(`[LocalAI] Edit failed: ${toolResult}`);
                            }
                            else {
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
                            this.lastPendingCount = (0, tools_1.getPendingEditsCount)();
                            this.messages.push({ role: 'assistant', content: 'Değişiklikler diff editörde. Onaylayın veya reddedin.' });
                            await this.saveCurrentSession();
                            if (statusUpdateInterval)
                                clearInterval(statusUpdateInterval);
                            (0, extension_1.hideGeneratingStatus)();
                            this.panel.webview.postMessage({ command: 'endResponse' });
                            return;
                        }
                    }
                    this.panel.webview.postMessage({ command: 'startResponse' });
                    continue;
                }
                else {
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
                }
                else {
                    // İlerleme yok - takılmış
                    this.messages.push({
                        role: 'assistant',
                        content: `⚠️ Hard limit (${HARD_LIMIT} iterations) reached without making changes. The task may be too complex or I need more specific guidance. Please break it down into smaller steps.`
                    });
                    this.panel.webview.postMessage({ command: 'appendToken', token: `\n\n⚠️ *Hard limit reached. No changes made.*` });
                }
            }
        }
        finally {
            if (statusUpdateInterval)
                clearInterval(statusUpdateInterval);
            (0, extension_1.hideGeneratingStatus)();
            (0, extension_1.showReadyStatus)();
            this.abortController = null;
            // Onay beklemiyorsak response'u kapat
            if (!this.waitingForApproval) {
                this.panel.webview.postMessage({ command: 'endResponse' });
            }
        }
    }
    async continueAfterApproval() {
        this.messages.push({ role: 'user', content: '[Değişiklikler onaylandı. Devam et.]' });
        this.panel.webview.postMessage({ command: 'startResponse' });
        try {
            await this.runAgentLoop();
        }
        catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                this.panel.webview.postMessage({ command: 'error', text: error instanceof Error ? error.message : 'Hata' });
            }
        }
    }
    getHtmlContent() {
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
    dispose() {
        ChatPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d)
                d.dispose();
        }
    }
}
exports.ChatPanel = ChatPanel;


/***/ }),
/* 3 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OllamaService = void 0;
const vscode = __importStar(__webpack_require__(1));
const chatPanel_1 = __webpack_require__(2);
class OllamaService {
    baseUrl;
    constructor() {
        this.baseUrl = this.getBaseUrl();
    }
    getBaseUrl() {
        const config = vscode.workspace.getConfiguration('localai');
        return config.get('ollamaUrl') || 'http://localhost:11434';
    }
    updateBaseUrl() {
        this.baseUrl = this.getBaseUrl();
    }
    setBaseUrl(url) {
        this.baseUrl = url;
    }
    getCurrentUrl() {
        return this.baseUrl;
    }
    async chatWithTools(model, messages, tools, onToken, signal) {
        const url = `${this.baseUrl}/api/chat`;
        // Tool kullanımında streaming'i kapat (daha güvenilir tool calling için)
        const useStreaming = tools.length === 0;
        const requestBody = {
            model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            stream: useStreaming,
        };
        (0, chatPanel_1.log)(`[LocalAI] Chat request: ${model}, ${messages.length} messages, ${tools.length} tools`);
        // Retry mekanizması - model yüklenirken 500 hatası alınabilir
        const maxRetries = 3;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const fetchStartTime = Date.now();
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal,
                });
                const networkLatency = Date.now() - fetchStartTime;
                (0, chatPanel_1.log)(`[LocalAI] Network request completed in ${networkLatency}ms (status: ${response.status})`);
                // Cloudflare detection
                const cfRay = response.headers.get('cf-ray');
                if (cfRay) {
                    (0, chatPanel_1.log)(`[LocalAI] ⚠️  Cloudflare detected (cf-ray: ${cfRay}) - this may add latency`);
                }
                if (!response.ok) {
                    // 500 hatası - model yükleniyor olabilir, bekle ve tekrar dene
                    if (response.status === 500 && attempt < maxRetries) {
                        (0, chatPanel_1.log)(`[LocalAI] 500 error, retrying in ${attempt * 3}s... (attempt ${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 3000));
                        continue;
                    }
                    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
                }
                // Başarılı response - devam et
                return await this.processResponse(response, useStreaming, onToken);
            }
            catch (error) {
                lastError = error;
                // Abort hatası - retry yapma
                if (error instanceof DOMException && error.name === 'AbortError') {
                    throw error;
                }
                // Network hatası veya timeout - retry
                if (attempt < maxRetries) {
                    (0, chatPanel_1.log)(`[LocalAI] Request failed, retrying in ${attempt * 3}s... (attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 3000));
                    continue;
                }
            }
        }
        throw lastError || new Error('Request failed after retries');
    }
    async processResponse(response, useStreaming, onToken) {
        let fullContent = '';
        let toolCalls = [];
        if (!useStreaming) {
            // Non-streaming: tek bir JSON response
            const json = await response.json();
            (0, chatPanel_1.log)(`[LocalAI] Non-streaming response received (content: ${json.message?.content?.length || 0} chars)`);
            if (json.message?.content) {
                fullContent = json.message.content;
                onToken?.(json.message.content);
            }
            if (json.message?.tool_calls) {
                (0, chatPanel_1.log)(`[LocalAI] Tool calls received: ${json.message.tool_calls.length} calls`);
                toolCalls = json.message.tool_calls;
            }
            // Eğer native tool_calls boşsa, content içinden JSON tool call parse etmeyi dene
            if (toolCalls.length === 0 && fullContent) {
                const parsedToolCalls = this.parseToolCallsFromContent(fullContent);
                if (parsedToolCalls.length > 0) {
                    (0, chatPanel_1.log)(`[LocalAI] Parsed tool calls from content: ${parsedToolCalls.length} calls`);
                    toolCalls = parsedToolCalls;
                    // Tool call content'ini temizle (kullanıcıya göstermeye gerek yok)
                    fullContent = '';
                }
            }
        }
        else {
            // Streaming: satır satır JSON
            if (!response.body) {
                throw new Error('No response body');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) {
                            fullContent += json.message.content;
                            onToken?.(json.message.content);
                        }
                        if (json.message?.tool_calls) {
                            (0, chatPanel_1.log)(`[LocalAI] Tool calls received: ${json.message.tool_calls.length} calls`);
                            toolCalls = json.message.tool_calls;
                        }
                    }
                    catch {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        (0, chatPanel_1.log)(`[LocalAI] Chat response: ${fullContent.length} chars, ${toolCalls.length} tool calls`);
        return { content: fullContent, toolCalls };
    }
    async chat(model, messages, onToken) {
        const result = await this.chatWithTools(model, messages, [], onToken);
        return result.content;
    }
    async listModels() {
        const url = `${this.baseUrl}/api/tags`;
        (0, chatPanel_1.log)(`[LocalAI] Fetching models from: ${url}`);
        try {
            const response = await fetch(url);
            (0, chatPanel_1.log)(`[LocalAI] Response status: ${response.status}`);
            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.status}`);
            }
            const data = await response.json();
            const models = data.models?.map(m => m.name) || [];
            (0, chatPanel_1.log)(`[LocalAI] Found ${models.length} models`);
            return models;
        }
        catch (err) {
            (0, chatPanel_1.log)(`[LocalAI] Fetch error: ${err}`);
            throw err;
        }
    }
    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        }
        catch {
            return false;
        }
    }
    // Content içinden JSON tool call'larını parse et
    // Bazı modeller native tool_calls yerine content içinde JSON döndürüyor
    parseToolCallsFromContent(content) {
        const toolCalls = [];
        // Helper: tek bir tool call objesini parse et
        const parseToolCall = (obj) => {
            const name = obj.name;
            // arguments veya parameters olabilir
            const args = (obj.arguments || obj.parameters);
            if (name && args && typeof args === 'object') {
                return {
                    function: {
                        name,
                        arguments: args
                    }
                };
            }
            return null;
        };
        try {
            // 1. Markdown code block içindeki JSON'u bul
            const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                const parsed = JSON.parse(codeBlockMatch[1].trim());
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const tc = parseToolCall(item);
                        if (tc)
                            toolCalls.push(tc);
                    }
                }
                else {
                    const tc = parseToolCall(parsed);
                    if (tc)
                        toolCalls.push(tc);
                }
                if (toolCalls.length > 0)
                    return toolCalls;
            }
            // 2. Content içinde { ile başlayan JSON objesi ara
            const jsonObjectMatch = content.match(/\{[\s\S]*"name"\s*:\s*"(\w+)"[\s\S]*\}/);
            if (jsonObjectMatch) {
                try {
                    const parsed = JSON.parse(jsonObjectMatch[0]);
                    const tc = parseToolCall(parsed);
                    if (tc)
                        toolCalls.push(tc);
                    if (toolCalls.length > 0)
                        return toolCalls;
                }
                catch {
                    // Continue to next method
                }
            }
            // 3. Content'in tamamı JSON olabilir
            const trimmed = content.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const tc = parseToolCall(item);
                        if (tc)
                            toolCalls.push(tc);
                    }
                }
                else {
                    const tc = parseToolCall(parsed);
                    if (tc)
                        toolCalls.push(tc);
                }
            }
        }
        catch {
            // JSON parse hatası - tool call yok
        }
        return toolCalls;
    }
}
exports.OllamaService = OllamaService;


/***/ }),
/* 4 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VllmService = void 0;
const vscode = __importStar(__webpack_require__(1));
class VllmService {
    baseUrl;
    apiKey;
    timeoutMs;
    retry;
    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.apiKey = this.getApiKey();
        this.timeoutMs = this.getTimeoutMs();
        this.retry = this.getRetryOptions();
    }
    /** Re-read settings from VS Code config */
    updateBaseUrl() {
        this.baseUrl = this.getBaseUrl();
        this.apiKey = this.getApiKey();
        this.timeoutMs = this.getTimeoutMs();
        this.retry = this.getRetryOptions();
    }
    setBaseUrl(url) {
        this.baseUrl = this.normalizeBaseUrl(url);
    }
    getCurrentUrl() {
        return this.baseUrl;
    }
    async isAvailable() {
        try {
            const resp = await this.fetchWithRetry(`${this.baseUrl}/v1/models`, { method: 'GET' });
            return resp.ok;
        }
        catch {
            return false;
        }
    }
    async listModels() {
        const url = `${this.baseUrl}/v1/models`;
        console.log('[LocalAI/vLLM] Fetching models from:', url);
        const resp = await this.fetchWithRetry(url, { method: 'GET' });
        if (!resp.ok) {
            const body = await this.safeReadText(resp);
            throw new Error(`vLLM listModels failed: ${resp.status} ${resp.statusText}${body ? ` | ${body}` : ''}`);
        }
        const data = (await resp.json());
        const models = (data?.data || []).map(m => m.id).filter(Boolean);
        console.log('[LocalAI/vLLM] Models:', models);
        return models;
    }
    async chat(model, messages, onToken, signal) {
        const result = await this.chatWithTools(model, messages, [], onToken, signal);
        return result.content;
    }
    /**
     * Chat with optional OpenAI tool calling.
     *
     * NOTE: Your app's internal "tool" messages do not track OpenAI tool_call_id.
     * For compatibility and to avoid strict servers rejecting tool messages, we
     * re-encode tool results as user messages.
     */
    async chatWithTools(model, messages, tools, onToken, signal) {
        const url = `${this.baseUrl}/v1/chat/completions`;
        // Streaming with tools can be flaky across models/servers.
        // Keep it simple: stream only when no tools.
        const useStreaming = tools.length === 0;
        const openaiMessages = this.toOpenAIMessages(messages);
        const requestBody = {
            model,
            messages: openaiMessages,
            stream: useStreaming,
        };
        if (tools.length > 0)
            requestBody.tools = tools;
        console.log('[LocalAI/vLLM] Chat request:', {
            url,
            model,
            messageCount: messages.length,
            toolCount: tools.length,
            toolNames: tools.map(t => t.function.name),
            streaming: useStreaming,
        });
        const resp = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(requestBody),
        }, signal);
        if (!resp.ok) {
            const body = await this.safeReadText(resp);
            throw new Error(`vLLM API error: ${resp.status} ${resp.statusText}${body ? ` | ${body}` : ''}`);
        }
        return this.processChatResponse(resp, useStreaming, onToken);
    }
    // -----------------------------
    // Internals
    // -----------------------------
    getBaseUrl() {
        const config = vscode.workspace.getConfiguration('localai');
        // Prefer localhost for sanity.
        const configured = config.get('vllmUrl') || 'http://127.0.0.1:8000';
        return this.normalizeBaseUrl(configured);
    }
    getApiKey() {
        const config = vscode.workspace.getConfiguration('localai');
        const key = config.get('vllmApiKey');
        return key && key.trim().length > 0 ? key.trim() : undefined;
    }
    getTimeoutMs() {
        const config = vscode.workspace.getConfiguration('localai');
        const ms = config.get('vllmTimeoutMs');
        // default: 2 minutes
        return typeof ms === 'number' && ms > 0 ? ms : 120_000;
    }
    getRetryOptions() {
        const config = vscode.workspace.getConfiguration('localai');
        const maxRetries = config.get('vllmMaxRetries');
        const baseDelayMs = config.get('vllmRetryBaseDelayMs');
        const maxDelayMs = config.get('vllmRetryMaxDelayMs');
        return {
            maxRetries: typeof maxRetries === 'number' && maxRetries >= 0 ? maxRetries : 3,
            baseDelayMs: typeof baseDelayMs === 'number' && baseDelayMs > 0 ? baseDelayMs : 750,
            maxDelayMs: typeof maxDelayMs === 'number' && maxDelayMs > 0 ? maxDelayMs : 8_000,
        };
    }
    normalizeBaseUrl(url) {
        const trimmed = (url || '').trim();
        if (!trimmed)
            return 'http://127.0.0.1:8000';
        // Remove trailing slash
        return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }
    buildHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            // OpenAI-style auth header
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return headers;
    }
    toOpenAIMessages(messages) {
        return messages.map((m, idx) => {
            // Your internal pipeline uses role:'tool' without a tool_call_id.
            // Some OpenAI servers reject tool messages without tool_call_id.
            // So we degrade tool results into a user message.
            if (m.role === 'tool') {
                return {
                    role: 'user',
                    content: `TOOL_RESULT:\n${m.content}`,
                };
            }
            const out = {
                role: m.role,
                content: m.content ?? null,
            };
            // If you ever store tool_calls on assistant messages, keep them compatible.
            if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
                out.tool_calls = m.tool_calls.map((tc, tcIndex) => ({
                    id: `call_${idx}_${tcIndex}`,
                    type: 'function',
                    function: {
                        name: tc.function.name,
                        arguments: JSON.stringify(tc.function.arguments ?? {}),
                    },
                }));
            }
            return out;
        });
    }
    async processChatResponse(response, useStreaming, onToken) {
        let fullContent = '';
        let toolCalls = [];
        if (!useStreaming) {
            const json = (await response.json());
            const choice = json?.choices?.[0];
            const msg = choice?.message;
            if (msg?.content) {
                fullContent = msg.content;
                onToken?.(msg.content);
            }
            if (msg?.tool_calls && msg.tool_calls.length > 0) {
                toolCalls = this.convertOpenAIToolCalls(msg.tool_calls);
            }
            // Fallback: some models dump tool JSON in content
            if (toolCalls.length === 0 && fullContent) {
                const parsed = this.parseToolCallsFromContent(fullContent);
                if (parsed.length > 0) {
                    toolCalls = parsed;
                    fullContent = '';
                }
            }
        }
        else {
            if (!response.body)
                throw new Error('No response body');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            // Accumulate tool calls (rare in streaming mode here, but supported)
            const streamingToolCalls = new Map();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line.startsWith('data:'))
                        continue;
                    const payload = line.replace(/^data:\s*/, '');
                    if (!payload || payload === '[DONE]')
                        continue;
                    let chunk = null;
                    try {
                        chunk = JSON.parse(payload);
                    }
                    catch {
                        continue;
                    }
                    const delta = chunk?.choices?.[0]?.delta;
                    if (delta?.content) {
                        fullContent += delta.content;
                        onToken?.(delta.content);
                    }
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const existing = streamingToolCalls.get(tc.index) || { name: '', arguments: '' };
                            if (tc.function?.name)
                                existing.name = tc.function.name;
                            if (tc.function?.arguments)
                                existing.arguments += tc.function.arguments;
                            streamingToolCalls.set(tc.index, existing);
                        }
                    }
                }
            }
            if (streamingToolCalls.size > 0) {
                for (const [, tc] of streamingToolCalls) {
                    const args = this.safeJsonParse(tc.arguments);
                    if (args && typeof args === 'object') {
                        toolCalls.push({
                            function: {
                                name: tc.name,
                                arguments: args,
                            },
                        });
                    }
                }
            }
        }
        console.log('[LocalAI/vLLM] Chat response:', {
            contentLength: fullContent.length,
            toolCallCount: toolCalls.length,
            toolCalls: toolCalls.map(tc => tc.function?.name),
        });
        return { content: fullContent, toolCalls };
    }
    convertOpenAIToolCalls(openaiToolCalls) {
        const out = [];
        for (const tc of openaiToolCalls) {
            const args = this.safeJsonParse(tc.function.arguments) || {};
            out.push({
                function: {
                    name: tc.function.name,
                    arguments: args,
                },
            });
        }
        return out;
    }
    // Parse JSON tool calls from content (fallback for models without native tool_calls)
    parseToolCallsFromContent(content) {
        const toolCalls = [];
        const parseOne = (obj) => {
            const name = obj.name;
            const args = (obj.arguments || obj.parameters);
            if (name && args && typeof args === 'object') {
                return { function: { name, arguments: args } };
            }
            return null;
        };
        try {
            const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                const parsed = this.safeJsonParse(codeBlockMatch[1].trim());
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const tc = parseOne(item);
                        if (tc)
                            toolCalls.push(tc);
                    }
                }
                else if (parsed && typeof parsed === 'object') {
                    const tc = parseOne(parsed);
                    if (tc)
                        toolCalls.push(tc);
                }
                if (toolCalls.length > 0)
                    return toolCalls;
            }
            const trimmed = content.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                const parsed = this.safeJsonParse(trimmed);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const tc = parseOne(item);
                        if (tc)
                            toolCalls.push(tc);
                    }
                }
                else if (parsed && typeof parsed === 'object') {
                    const tc = parseOne(parsed);
                    if (tc)
                        toolCalls.push(tc);
                }
            }
        }
        catch {
            // ignore
        }
        return toolCalls;
    }
    safeJsonParse(text) {
        try {
            return JSON.parse(text);
        }
        catch {
            return null;
        }
    }
    async safeReadText(resp) {
        try {
            return await resp.text();
        }
        catch {
            return '';
        }
    }
    async fetchWithRetry(url, init, externalSignal) {
        const { maxRetries, baseDelayMs, maxDelayMs } = this.retry;
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            const signal = this.mergeSignals(externalSignal, controller.signal);
            try {
                const fetchStartTime = Date.now();
                const resp = await fetch(url, {
                    ...init,
                    headers: {
                        ...init.headers,
                        ...this.buildHeaders(),
                    },
                    signal,
                });
                const networkLatency = Date.now() - fetchStartTime;
                console.log(`[LocalAI/vLLM] Network request completed in ${networkLatency}ms (status: ${resp.status})`);
                // Cloudflare detection
                const cfRay = resp.headers.get('cf-ray');
                if (cfRay) {
                    console.log(`[LocalAI/vLLM] ⚠️  Cloudflare detected (cf-ray: ${cfRay}) - this may add latency`);
                }
                clearTimeout(timeout);
                // Retry on transient 5xx (common while vLLM is loading a model)
                if (resp.status >= 500 && resp.status <= 599 && attempt < maxRetries) {
                    const delay = this.backoffDelay(attempt, baseDelayMs, maxDelayMs);
                    console.log(`[LocalAI/vLLM] ${resp.status} retry in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                    await this.sleep(delay);
                    continue;
                }
                return resp;
            }
            catch (err) {
                clearTimeout(timeout);
                lastError = err;
                // External abort should stop immediately
                if (externalSignal?.aborted)
                    throw err;
                // AbortError from timeout: retry if allowed
                const name = err?.name;
                if (name === 'AbortError' && attempt >= maxRetries)
                    throw err;
                if (attempt < maxRetries) {
                    const delay = this.backoffDelay(attempt, baseDelayMs, maxDelayMs);
                    console.log(`[LocalAI/vLLM] Request failed, retry in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, err);
                    await this.sleep(delay);
                    continue;
                }
                throw err;
            }
        }
        // Shouldn't reach
        throw lastError instanceof Error ? lastError : new Error('vLLM request failed');
    }
    backoffDelay(attempt, base, max) {
        // Exponential backoff with jitter
        const exp = Math.min(max, Math.floor(base * Math.pow(2, attempt)));
        const jitter = Math.floor(Math.random() * Math.min(250, exp));
        return Math.min(max, exp + jitter);
    }
    async sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
    mergeSignals(a, b) {
        if (!a)
            return b;
        if (!b)
            return a;
        // If either aborts, abort the merged controller.
        const controller = new AbortController();
        const onAbort = () => {
            try {
                controller.abort();
            }
            catch {
                // ignore
            }
        };
        if (a.aborted || b.aborted) {
            onAbort();
        }
        else {
            a.addEventListener('abort', onAbort, { once: true });
            b.addEventListener('abort', onAbort, { once: true });
        }
        return controller.signal;
    }
}
exports.VllmService = VllmService;


/***/ }),
/* 5 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.tools = void 0;
exports.onPendingEditsChanged = onPendingEditsChanged;
exports.getPendingEdit = getPendingEdit;
exports.getPendingEditForFile = getPendingEditForFile;
exports.clearPendingEdit = clearPendingEdit;
exports.applyPendingEdit = applyPendingEdit;
exports.rejectPendingEdit = rejectPendingEdit;
exports.getAllPendingEdits = getAllPendingEdits;
exports.applyAllPendingEdits = applyAllPendingEdits;
exports.rejectAllPendingEdits = rejectAllPendingEdits;
exports.getPendingEditsCount = getPendingEditsCount;
exports.getOllamaTools = getOllamaTools;
exports.getSystemPrompt = getSystemPrompt;
exports.executeTool = executeTool;
const vscode = __importStar(__webpack_require__(1));
const path = __importStar(__webpack_require__(6));
const fs = __importStar(__webpack_require__(7));
let pendingEdits = new Map();
const pendingEditsListeners = [];
function notifyPendingEditsChanged() {
    pendingEditsListeners.forEach(listener => listener());
}
function onPendingEditsChanged(listener) {
    pendingEditsListeners.push(listener);
    return new vscode.Disposable(() => {
        const index = pendingEditsListeners.indexOf(listener);
        if (index >= 0) {
            pendingEditsListeners.splice(index, 1);
        }
    });
}
function getPendingEdit(id) {
    return pendingEdits.get(id);
}
// Get pending edit by file path (checks temp files too)
function getPendingEditForFile(filePath) {
    // Check if this is a temp diff file
    const tempDir = path.join((__webpack_require__(8).tmpdir)(), 'localai-diff');
    if (filePath.startsWith(tempDir)) {
        // Extract edit ID from filename
        const fileName = path.basename(filePath);
        const match = fileName.match(/^(edit_\d+_\w+)_/);
        if (match) {
            return pendingEdits.get(match[1]);
        }
    }
    // Check if there's a pending edit for this actual file
    for (const edit of pendingEdits.values()) {
        if (edit.filePath === filePath) {
            return edit;
        }
    }
    return undefined;
}
function clearPendingEdit(id) {
    pendingEdits.delete(id);
    notifyPendingEditsChanged();
}
async function applyPendingEdit(id) {
    const edit = pendingEdits.get(id);
    if (!edit) {
        return 'Error: Edit not found or already applied';
    }
    try {
        fs.writeFileSync(edit.filePath, edit.newContent, 'utf-8');
        const doc = await vscode.workspace.openTextDocument(edit.filePath);
        await vscode.window.showTextDocument(doc, { preview: false });
        pendingEdits.delete(id);
        cleanupTempFiles(id);
        // Close diff editor tabs
        await closeDiffEditors(id);
        notifyPendingEditsChanged();
        return `✓ Applied changes to ${edit.relativePath}`;
    }
    catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Could not apply edit'}`;
    }
}
async function rejectPendingEdit(id) {
    const edit = pendingEdits.get(id);
    if (!edit) {
        return 'Edit not found';
    }
    pendingEdits.delete(id);
    cleanupTempFiles(id);
    // Close diff editor tabs
    await closeDiffEditors(id);
    notifyPendingEditsChanged();
    return `✗ Rejected changes to ${edit.relativePath}`;
}
function getAllPendingEdits() {
    return Array.from(pendingEdits.values());
}
async function applyAllPendingEdits() {
    const edits = getAllPendingEdits();
    if (edits.length === 0) {
        return 'No pending edits to apply';
    }
    const results = [];
    for (const edit of edits) {
        try {
            fs.writeFileSync(edit.filePath, edit.newContent, 'utf-8');
            pendingEdits.delete(edit.id);
            cleanupTempFiles(edit.id);
            await closeDiffEditors(edit.id);
            results.push(`✓ ${edit.relativePath}`);
        }
        catch (error) {
            results.push(`✗ ${edit.relativePath}: ${error instanceof Error ? error.message : 'Failed'}`);
        }
    }
    return `Applied ${results.filter(r => r.startsWith('✓')).length}/${edits.length} edits:\n${results.join('\n')}`;
}
async function rejectAllPendingEdits() {
    const edits = getAllPendingEdits();
    const count = edits.length;
    for (const edit of edits) {
        cleanupTempFiles(edit.id);
        await closeDiffEditors(edit.id);
    }
    pendingEdits.clear();
    return `✗ Rejected ${count} pending edit(s)`;
}
function getPendingEditsCount() {
    return pendingEdits.size;
}
// Temp directory for diff files
const tempDiffDir = path.join((__webpack_require__(8).tmpdir)(), 'localai-diff');
// Ensure temp dir exists
function ensureTempDir() {
    if (!fs.existsSync(tempDiffDir)) {
        fs.mkdirSync(tempDiffDir, { recursive: true });
    }
}
// Show VSCode native diff editor
async function showVSCodeDiff(editId, filePath, relativePath, oldContent, newContent) {
    ensureTempDir();
    // Create temp files for diff
    const originalFile = path.join(tempDiffDir, `${editId}_original${path.extname(filePath)}`);
    const modifiedFile = path.join(tempDiffDir, `${editId}_modified${path.extname(filePath)}`);
    fs.writeFileSync(originalFile, oldContent, 'utf-8');
    fs.writeFileSync(modifiedFile, newContent, 'utf-8');
    const originalUri = vscode.Uri.file(originalFile);
    const modifiedUri = vscode.Uri.file(modifiedFile);
    // Open VSCode diff editor
    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, `${relativePath} (Proposed Changes - ${editId.slice(-6)})`);
}
// Clean up temp files for an edit
function cleanupTempFiles(editId) {
    try {
        const files = fs.readdirSync(tempDiffDir);
        files.filter(f => f.startsWith(editId)).forEach(f => {
            fs.unlinkSync(path.join(tempDiffDir, f));
        });
    }
    catch {
        // Ignore cleanup errors
    }
}
// Close diff editor tabs for a specific edit
async function closeDiffEditors(editId) {
    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
    for (const tab of tabs) {
        if (tab.label.includes(editId.slice(-6))) {
            const tabInput = tab.input;
            if (tabInput) {
                await vscode.window.tabGroups.close(tab);
            }
        }
    }
}
// Generate simple diff summary for chat display
function generateDiffSummary(oldText, newText, filePath) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    let additions = 0;
    let deletions = 0;
    // Count changed lines
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
        if (oldLines[i] !== newLines[i]) {
            if (oldLines[i] !== undefined)
                deletions++;
            if (newLines[i] !== undefined)
                additions++;
        }
    }
    return `📝 ${filePath}: +${additions} -${deletions} lines`;
}
// Parametre normalizasyonu - modeller farklı isimler kullanabilir
function normalizeParams(params) {
    const normalized = { ...params };
    // path alternatifleri
    if (!normalized.path) {
        normalized.path = params.file_path || params.filepath || params.file || params.filename || params.name || '';
    }
    // content alternatifleri
    if (!normalized.content) {
        normalized.content = params.code || params.text || params.data || params.body || '';
    }
    // old_text alternatifleri
    if (!normalized.old_text) {
        normalized.old_text = params.oldText || params.old || params.find || params.search || params.original || '';
    }
    // new_text alternatifleri
    if (!normalized.new_text) {
        normalized.new_text = params.newText || params.new || params.replace || params.replacement || '';
    }
    // command alternatifleri
    if (!normalized.command) {
        normalized.command = params.cmd || params.shell || params.exec || '';
    }
    // pattern alternatifleri (search_files için)
    if (!normalized.pattern) {
        normalized.pattern = params.query || params.search || params.regex || '';
    }
    return normalized;
}
exports.tools = [
    {
        name: 'read_file',
        description: 'Read the contents of a file. Use this to understand code before making changes.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path relative to project root'
                },
                start_line: {
                    type: 'string',
                    description: 'Optional: starting line number (1-indexed)'
                },
                end_line: {
                    type: 'string',
                    description: 'Optional: ending line number (1-indexed)'
                }
            },
            required: ['path']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            if (!params.path) {
                return 'Error: path parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return 'Error: No workspace folder open';
            }
            const filePath = path.join(workspaceRoot, params.path);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const startLine = params.start_line ? parseInt(params.start_line) - 1 : 0;
                const endLine = params.end_line ? parseInt(params.end_line) : lines.length;
                const selectedLines = lines.slice(startLine, endLine);
                const numberedLines = selectedLines.map((line, i) => `${(startLine + i + 1).toString().padStart(4)}: ${line}`);
                // Eğer dosya çok uzunsa (100+ satır), ortasını kes
                const MAX_LINES = 100;
                let result = numberedLines.join('\n');
                if (numberedLines.length > MAX_LINES) {
                    const topLines = numberedLines.slice(0, 50).join('\n');
                    const bottomLines = numberedLines.slice(-50).join('\n');
                    result = `${topLines}\n... [${numberedLines.length - MAX_LINES} lines omitted] ...\n${bottomLines}`;
                }
                // Hatırlatma ekle
                return `File: ${params.path}\n${'─'.repeat(50)}\n${result}\n${'─'.repeat(50)}\nYou have read the file. Now USE edit_file to fix the issue. DO NOT read again.`;
            }
            catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Could not read file'}`;
            }
        }
    },
    {
        name: 'write_file',
        description: 'Create a new file or completely overwrite an existing file. Shows diff preview for user approval.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path relative to project root'
                },
                content: {
                    type: 'string',
                    description: 'Complete file content to write'
                }
            },
            required: ['path', 'content']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            if (!params.path) {
                return 'Error: path parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            if (!params.content) {
                return 'Error: content parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return 'Error: No workspace folder open';
            }
            const filePath = path.join(workspaceRoot, params.path);
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                const newContent = params.content;
                // Auto-approve modunda direkt yaz
                if (params._skipDiff === 'true') {
                    fs.writeFileSync(filePath, newContent, 'utf-8');
                    return `✓ ${params.path} yazıldı (${newContent.split('\n').length} satır)`;
                }
                // Get existing content if file exists
                const oldContent = fs.existsSync(filePath)
                    ? fs.readFileSync(filePath, 'utf-8')
                    : '';
                // Create pending edit for diff preview
                const editId = `edit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                const pendingEdit = {
                    id: editId,
                    filePath,
                    relativePath: params.path,
                    oldContent,
                    newContent,
                    oldText: oldContent,
                    newText: newContent,
                    timestamp: Date.now()
                };
                pendingEdits.set(editId, pendingEdit);
                notifyPendingEditsChanged();
                // Show VSCode native diff editor
                await showVSCodeDiff(editId, filePath, params.path, oldContent, newContent);
                // Return summary for chat
                const isNewFile = oldContent === '';
                const summary = isNewFile
                    ? `📄 New file: ${params.path} (${newContent.split('\n').length} lines)`
                    : generateDiffSummary(oldContent, newContent, params.path);
                return `PENDING_EDIT:${editId}\n${summary}\n\n👆 VSCode diff editor açıldı. Değişiklikleri inceleyin.`;
            }
            catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Could not write file'}`;
            }
        }
    },
    {
        name: 'edit_file',
        description: 'Replace text in a file. Shows diff preview for user approval before applying changes.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path relative to project root'
                },
                old_text: {
                    type: 'string',
                    description: 'Exact text to find (must match exactly including whitespace)'
                },
                new_text: {
                    type: 'string',
                    description: 'New text to replace with'
                }
            },
            required: ['path', 'old_text', 'new_text']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            if (!params.path) {
                return 'Error: path parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            if (!params.old_text) {
                return 'Error: old_text parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            if (!params.new_text && params.new_text !== '') {
                return 'Error: new_text parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return 'Error: No workspace folder open';
            }
            const filePath = path.join(workspaceRoot, params.path);
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                const files = fs.readdirSync(workspaceRoot);
                const suggestions = files.filter(f => f.includes(params.path.replace(/^\.\//, '').split('/').pop() || ''));
                return `Error: File not found: ${params.path}\n\nFiles in project root:\n${files.slice(0, 20).map(f => '  ' + f).join('\n')}${suggestions.length > 0 ? '\n\nDid you mean: ' + suggestions.join(', ') : ''}`;
            }
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (!content.includes(params.old_text)) {
                    const lines = content.split('\n');
                    const preview = lines.slice(0, 30).map((l, i) => `${i + 1}: ${l}`).join('\n');
                    return `Error: old_text not found in file.\n\nActual content of ${params.path}:\n${'─'.repeat(40)}\n${preview}${lines.length > 30 ? '\n... (' + (lines.length - 30) + ' more lines)' : ''}\n${'─'.repeat(40)}\n\nCopy the EXACT text you want to replace from above.`;
                }
                const newContent = content.replace(params.old_text, params.new_text);
                // Auto-approve modunda direkt yaz
                if (params._skipDiff === 'true') {
                    fs.writeFileSync(filePath, newContent, 'utf-8');
                    const changedLines = params.new_text.split('\n').length;
                    return `✓ ${params.path} düzenlendi (~${changedLines} satır değişti)`;
                }
                // Create pending edit
                const editId = `edit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                const pendingEdit = {
                    id: editId,
                    filePath,
                    relativePath: params.path,
                    oldContent: content,
                    newContent,
                    oldText: params.old_text,
                    newText: params.new_text,
                    timestamp: Date.now()
                };
                pendingEdits.set(editId, pendingEdit);
                notifyPendingEditsChanged();
                // Show VSCode native diff editor
                await showVSCodeDiff(editId, filePath, params.path, content, newContent);
                // Return summary for chat
                const summary = generateDiffSummary(content, newContent, params.path);
                return `PENDING_EDIT:${editId}\n${summary}\n\n👆 VSCode diff editor açıldı. Değişiklikleri inceleyin.`;
            }
            catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Could not edit file'}`;
            }
        }
    },
    {
        name: 'list_files',
        description: 'List files and folders in a directory. Use to explore project structure.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory path relative to project root (use "." for root)'
                },
                recursive: {
                    type: 'string',
                    description: 'Set to "true" to list recursively (max 3 levels)'
                }
            },
            required: ['path']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return 'Error: No workspace folder open';
            }
            const dirPath = path.join(workspaceRoot, params.path || '.');
            const recursive = params.recursive === 'true';
            const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '.vscode', '__pycache__', 'venv'];
            function listDir(dir, prefix = '', depth = 0) {
                if (depth > 3)
                    return [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                const results = [];
                for (const entry of entries) {
                    if (entry.name.startsWith('.') && entry.name !== '.env')
                        continue;
                    if (ignoreDirs.includes(entry.name))
                        continue;
                    const isDir = entry.isDirectory();
                    results.push(`${prefix}${isDir ? '📁 ' : '📄 '}${entry.name}`);
                    if (isDir && recursive) {
                        const subPath = path.join(dir, entry.name);
                        results.push(...listDir(subPath, prefix + '  ', depth + 1));
                    }
                }
                return results;
            }
            try {
                const result = listDir(dirPath);
                return result.length > 0 ? result.join('\n') : 'Empty directory';
            }
            catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Could not list directory'}`;
            }
        }
    },
    {
        name: 'grep',
        description: 'Search for text/pattern in files. Returns matching lines with file paths and line numbers.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Text or regex pattern to search for'
                },
                path: {
                    type: 'string',
                    description: 'Directory to search in (default: project root)'
                },
                file_pattern: {
                    type: 'string',
                    description: 'File glob pattern like "*.ts" or "*.py" (default: all files)'
                }
            },
            required: ['pattern']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            if (!params.pattern) {
                return 'Error: pattern parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return 'Error: No workspace folder open';
            }
            const searchPath = params.path ? path.join(workspaceRoot, params.path) : workspaceRoot;
            const filePattern = params.file_pattern || '**/*';
            const results = [];
            const maxResults = 50;
            const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '__pycache__'];
            function searchInDir(dir) {
                if (results.length >= maxResults)
                    return;
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (results.length >= maxResults)
                        break;
                    if (ignoreDirs.includes(entry.name))
                        continue;
                    if (entry.name.startsWith('.'))
                        continue;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        searchInDir(fullPath);
                    }
                    else if (entry.isFile()) {
                        // Check file pattern
                        if (params.file_pattern) {
                            const ext = params.file_pattern.replace('*', '');
                            if (!entry.name.endsWith(ext))
                                continue;
                        }
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            const lines = content.split('\n');
                            const regex = new RegExp(params.pattern, 'gi');
                            lines.forEach((line, i) => {
                                if (results.length >= maxResults)
                                    return;
                                if (regex.test(line)) {
                                    const relPath = path.relative(workspaceRoot, fullPath);
                                    results.push(`${relPath}:${i + 1}: ${line.trim()}`);
                                }
                                regex.lastIndex = 0; // Reset regex
                            });
                        }
                        catch {
                            // Skip binary files
                        }
                    }
                }
            }
            try {
                searchInDir(searchPath);
                if (results.length === 0) {
                    return `No matches found for "${params.pattern}"`;
                }
                return `Found ${results.length} match(es):\n${'─'.repeat(50)}\n${results.join('\n')}`;
            }
            catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Search failed'}`;
            }
        }
    },
    {
        name: 'get_selection',
        description: 'Get the currently selected text in the active editor',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        execute: async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return 'No active editor';
            }
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            if (!selectedText) {
                return 'No text selected';
            }
            const fileName = path.basename(editor.document.fileName);
            const startLine = selection.start.line + 1;
            const endLine = selection.end.line + 1;
            return `Selected text from ${fileName} (lines ${startLine}-${endLine}):\n${'─'.repeat(50)}\n${selectedText}`;
        }
    },
    {
        name: 'get_open_file',
        description: 'Get the full content of the currently open file in editor',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        execute: async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return 'No file is open';
            }
            const fileName = path.basename(editor.document.fileName);
            const content = editor.document.getText();
            const lines = content.split('\n');
            const numberedLines = lines.map((line, i) => `${(i + 1).toString().padStart(4)}: ${line}`);
            return `File: ${fileName}\n${'─'.repeat(50)}\n${numberedLines.join('\n')}`;
        }
    },
    {
        name: 'run_terminal_command',
        description: 'Run a shell command. Use for npm, git, build commands etc.',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Shell command to run'
                }
            },
            required: ['command']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            if (!params.command) {
                return 'Error: command parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            return new Promise((resolve) => {
                const { exec } = __webpack_require__(9);
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                exec(params.command, { cwd: workspaceRoot, timeout: 30000 }, (error, stdout, stderr) => {
                    if (error) {
                        resolve(`Error: ${error.message}\n${stderr}`);
                    }
                    else {
                        const output = stdout || stderr || 'Command completed (no output)';
                        resolve(`$ ${params.command}\n${'─'.repeat(50)}\n${output}`);
                    }
                });
            });
        }
    },
    {
        name: 'show_diff',
        description: 'Show a diff preview of changes without applying them',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'File path'
                },
                new_content: {
                    type: 'string',
                    description: 'Proposed new content'
                }
            },
            required: ['path', 'new_content']
        },
        execute: async (rawParams) => {
            const params = normalizeParams(rawParams);
            if (!params.path) {
                return 'Error: path parameter is required. Received: ' + JSON.stringify(rawParams);
            }
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return 'Error: No workspace folder open';
            }
            const filePath = path.join(workspaceRoot, params.path);
            try {
                const oldContent = fs.existsSync(filePath)
                    ? fs.readFileSync(filePath, 'utf-8')
                    : '';
                const oldLines = oldContent.split('\n');
                const newLines = (params.new_content || '').split('\n');
                const diff = [`Diff for ${params.path}:`, '─'.repeat(50)];
                const maxLines = Math.max(oldLines.length, newLines.length);
                for (let i = 0; i < maxLines; i++) {
                    const oldLine = oldLines[i] || '';
                    const newLine = newLines[i] || '';
                    if (oldLine !== newLine) {
                        if (oldLines[i] !== undefined) {
                            diff.push(`- ${i + 1}: ${oldLine}`);
                        }
                        if (newLines[i] !== undefined) {
                            diff.push(`+ ${i + 1}: ${newLine}`);
                        }
                    }
                }
                return diff.join('\n');
            }
            catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Could not generate diff'}`;
            }
        }
    }
];
// Convert to Ollama tool format
function getOllamaTools() {
    return exports.tools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }
    }));
}
// System prompt for tool-enabled chat
function getSystemPrompt() {
    return `You have access to tools for file operations. Use them efficiently.

Available tools and when to use them:

read_file(path, start_line?, end_line?)
- Read file content before editing
- Use start_line/end_line to read specific sections
- Read ONCE per file, then act

write_file(path, content)
- Create new file or overwrite existing file
- Include complete file content

edit_file(path, old_text, new_text)
- Modify existing file
- old_text must match EXACTLY (including whitespace)
- Read the file first to get exact text

list_files(path, recursive?)
- See directory contents
- Use recursive=true for nested listing

grep(pattern, path?, file_pattern?)
- Search text across files
- Use when file location is unknown

run_terminal_command(command)
- Run shell commands (npm, git, etc)

get_selection()
- Get currently selected text in editor

get_open_file()
- Get content of file open in editor

Best practices:
- Read once, act immediately
- Don't repeat the same tool call
- Trust user's information (file paths, line numbers)
- Minimum tool calls for maximum efficiency
- If user says "fix X in file.ts", just read file.ts and edit it - don't search or overthink

CRITICAL RULE:
After reading a file with an error, your NEXT tool call MUST be edit_file to fix it.
DO NOT search, grep, or read other files. FIX THE ERROR IMMEDIATELY.`;
}
async function executeTool(name, params, options) {
    const tool = exports.tools.find(t => t.name === name);
    if (!tool) {
        return `Unknown tool: ${name}`;
    }
    // Auto-approve modunda write_file/edit_file için diff gösterme
    if (options?.autoApprove && ['write_file', 'edit_file'].includes(name)) {
        return await tool.execute({ ...params, _skipDiff: 'true' });
    }
    return await tool.execute(params);
}


/***/ }),
/* 6 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("os");

/***/ }),
/* 9 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryService = void 0;
const CHAT_HISTORY_KEY = 'localai.chatHistory';
const CURRENT_SESSION_KEY = 'localai.currentSession';
const PROJECT_MEMORY_KEY = 'localai.projectMemory';
class MemoryService {
    context;
    currentSession = null;
    constructor(context) {
        this.context = context;
    }
    // ========== Chat Sessions ==========
    async createNewSession(model) {
        const session = {
            id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: 'New Chat',
            messages: [],
            model,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.currentSession = session;
        await this.saveCurrentSessionId(session.id);
        return session;
    }
    getCurrentSession() {
        return this.currentSession;
    }
    async loadCurrentSession() {
        const sessionId = this.context.workspaceState.get(CURRENT_SESSION_KEY);
        if (!sessionId)
            return null;
        const sessions = await this.getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
        }
        return session || null;
    }
    async saveSession(session) {
        session.updatedAt = Date.now();
        // Auto-generate title from first user message
        if (session.title === 'New Chat' && session.messages.length > 0) {
            const firstUserMsg = session.messages.find(m => m.role === 'user');
            if (firstUserMsg) {
                session.title = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '');
            }
        }
        const sessions = await this.getAllSessions();
        const existingIndex = sessions.findIndex(s => s.id === session.id);
        if (existingIndex >= 0) {
            sessions[existingIndex] = session;
        }
        else {
            sessions.unshift(session);
        }
        // Keep only last 50 sessions
        const trimmedSessions = sessions.slice(0, 50);
        await this.context.workspaceState.update(CHAT_HISTORY_KEY, trimmedSessions);
        this.currentSession = session;
    }
    async getAllSessions() {
        return this.context.workspaceState.get(CHAT_HISTORY_KEY) || [];
    }
    async deleteSession(sessionId) {
        const sessions = await this.getAllSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);
        await this.context.workspaceState.update(CHAT_HISTORY_KEY, filtered);
        if (this.currentSession?.id === sessionId) {
            this.currentSession = null;
            await this.context.workspaceState.update(CURRENT_SESSION_KEY, undefined);
        }
    }
    async clearAllSessions() {
        await this.context.workspaceState.update(CHAT_HISTORY_KEY, []);
        await this.context.workspaceState.update(CURRENT_SESSION_KEY, undefined);
        this.currentSession = null;
    }
    async saveCurrentSessionId(sessionId) {
        await this.context.workspaceState.update(CURRENT_SESSION_KEY, sessionId);
    }
    // ========== Messages ==========
    async addMessage(message) {
        if (!this.currentSession)
            return;
        this.currentSession.messages.push(message);
        await this.saveSession(this.currentSession);
    }
    async getMessages() {
        return this.currentSession?.messages || [];
    }
    async clearCurrentMessages() {
        if (this.currentSession) {
            this.currentSession.messages = [];
            await this.saveSession(this.currentSession);
        }
    }
    // ========== Project Memory ==========
    async getProjectMemory() {
        const data = this.context.workspaceState.get(PROJECT_MEMORY_KEY);
        if (!data)
            return null;
        return {
            knownFiles: new Map(Object.entries(data.knownFiles || {})),
            projectNotes: data.projectNotes || '',
            commonCommands: data.commonCommands || [],
            updatedAt: data.updatedAt || Date.now()
        };
    }
    async saveProjectMemory(memory) {
        const data = {
            knownFiles: Object.fromEntries(memory.knownFiles),
            projectNotes: memory.projectNotes,
            commonCommands: memory.commonCommands,
            updatedAt: Date.now()
        };
        await this.context.workspaceState.update(PROJECT_MEMORY_KEY, data);
    }
    async addFileNote(filePath, note) {
        let memory = await this.getProjectMemory();
        if (!memory) {
            memory = {
                knownFiles: new Map(),
                projectNotes: '',
                commonCommands: [],
                updatedAt: Date.now()
            };
        }
        memory.knownFiles.set(filePath, note);
        await this.saveProjectMemory(memory);
    }
    async setProjectNotes(notes) {
        let memory = await this.getProjectMemory();
        if (!memory) {
            memory = {
                knownFiles: new Map(),
                projectNotes: '',
                commonCommands: [],
                updatedAt: Date.now()
            };
        }
        memory.projectNotes = notes;
        await this.saveProjectMemory(memory);
    }
    async addCommonCommand(command) {
        let memory = await this.getProjectMemory();
        if (!memory) {
            memory = {
                knownFiles: new Map(),
                projectNotes: '',
                commonCommands: [],
                updatedAt: Date.now()
            };
        }
        if (!memory.commonCommands.includes(command)) {
            memory.commonCommands.unshift(command);
            memory.commonCommands = memory.commonCommands.slice(0, 20);
            await this.saveProjectMemory(memory);
        }
    }
    // ========== Context for LLM ==========
    async getContextSummary() {
        const memory = await this.getProjectMemory();
        if (!memory)
            return '';
        const parts = [];
        if (memory.projectNotes) {
            parts.push(`## Project Notes\n${memory.projectNotes}`);
        }
        if (memory.knownFiles.size > 0) {
            const files = Array.from(memory.knownFiles.entries())
                .map(([path, note]) => `- ${path}: ${note}`)
                .join('\n');
            parts.push(`## Known Files\n${files}`);
        }
        if (memory.commonCommands.length > 0) {
            parts.push(`## Common Commands\n${memory.commonCommands.join(', ')}`);
        }
        return parts.length > 0 ? parts.join('\n\n') : '';
    }
    // ========== Export/Import ==========
    async exportHistory() {
        const sessions = await this.getAllSessions();
        const memory = await this.getProjectMemory();
        const exportData = {
            exportedAt: new Date().toISOString(),
            sessions,
            projectMemory: memory ? {
                knownFiles: Object.fromEntries(memory.knownFiles),
                projectNotes: memory.projectNotes,
                commonCommands: memory.commonCommands
            } : null
        };
        return JSON.stringify(exportData, null, 2);
    }
    async importHistory(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.sessions && Array.isArray(data.sessions)) {
                await this.context.workspaceState.update(CHAT_HISTORY_KEY, data.sessions);
            }
            if (data.projectMemory) {
                const memory = {
                    knownFiles: new Map(Object.entries(data.projectMemory.knownFiles || {})),
                    projectNotes: data.projectMemory.projectNotes || '',
                    commonCommands: data.projectMemory.commonCommands || [],
                    updatedAt: Date.now()
                };
                await this.saveProjectMemory(memory);
            }
            return { sessions: data.sessions?.length || 0, success: true };
        }
        catch {
            return { sessions: 0, success: false };
        }
    }
}
exports.MemoryService = MemoryService;


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map