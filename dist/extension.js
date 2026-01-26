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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
const chatPanel_1 = __webpack_require__(2);
const chatViewProvider_1 = __webpack_require__(9);
const memory_1 = __webpack_require__(10);
const tools_1 = __webpack_require__(4);
function activate(context) {
    console.log('LocalAI extension is now active!');
    // Initialize memory service
    const memoryService = new memory_1.MemoryService(context);
    // Sidebar view
    const chatViewProvider = new chatViewProvider_1.ChatViewProvider(context.extensionUri, memoryService);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatViewProvider_1.ChatViewProvider.viewType, chatViewProvider));
    // Command to open in editor panel
    const openChatCommand = vscode.commands.registerCommand('localai.openChat', () => {
        chatPanel_1.ChatPanel.createOrShow(context.extensionUri);
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
    context.subscriptions.push(openChatCommand, applyEditCommand, rejectEditCommand);
}
function deactivate() {
    if (chatPanel_1.ChatPanel.currentPanel) {
        chatPanel_1.ChatPanel.currentPanel.dispose();
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
const vscode = __importStar(__webpack_require__(1));
const ollama_1 = __webpack_require__(3);
const tools_1 = __webpack_require__(4);
class ChatPanel {
    static currentPanel;
    panel;
    extensionUri;
    ollama;
    messages = [];
    currentModel = '';
    disposables = [];
    constructor(panel, extensionUri) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.ollama = new ollama_1.OllamaService();
        this.panel.webview.html = this.getHtmlContent();
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this.handleUserMessage(message.text);
                    break;
                case 'selectModel':
                    this.currentModel = message.model;
                    break;
                case 'getModels':
                    await this.sendModelList();
                    break;
                case 'updateApiUrl':
                    this.ollama.setBaseUrl(message.url);
                    await this.sendModelList();
                    break;
                case 'clearChat':
                    this.messages = [];
                    break;
            }
        }, null, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.panel.reveal(column);
            return ChatPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('localaiChat', 'LocalAI Chat', column || vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
        return ChatPanel.currentPanel;
    }
    async sendModelList() {
        try {
            const models = await this.ollama.listModels();
            if (models.length > 0 && !models.includes(this.currentModel)) {
                this.currentModel = models[0];
            }
            this.panel.webview.postMessage({
                command: 'modelList',
                models,
                currentModel: this.currentModel
            });
        }
        catch (error) {
            this.panel.webview.postMessage({
                command: 'error',
                text: 'Ollama bağlantısı kurulamadı'
            });
        }
    }
    async handleUserMessage(text) {
        this.messages.push({ role: 'user', content: text });
        this.panel.webview.postMessage({
            command: 'addMessage',
            role: 'user',
            content: text
        });
        this.panel.webview.postMessage({
            command: 'startResponse'
        });
        try {
            await this.runAgentLoop();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
            this.panel.webview.postMessage({
                command: 'error',
                text: errorMessage
            });
        }
    }
    async runAgentLoop() {
        const maxIterations = 10;
        let iteration = 0;
        while (iteration < maxIterations) {
            iteration++;
            const messagesWithSystem = [
                { role: 'system', content: (0, tools_1.getSystemPrompt)() },
                ...this.messages
            ];
            const tools = (0, tools_1.getOllamaTools)();
            const { content, toolCalls } = await this.ollama.chatWithTools(this.currentModel, messagesWithSystem, tools, (token) => {
                this.panel.webview.postMessage({
                    command: 'appendToken',
                    token
                });
            });
            if (toolCalls && toolCalls.length > 0) {
                this.messages.push({
                    role: 'assistant',
                    content: content,
                    tool_calls: toolCalls
                });
                this.panel.webview.postMessage({ command: 'endResponse' });
                for (const toolCall of toolCalls) {
                    const toolName = toolCall.function.name;
                    const toolParams = toolCall.function.arguments;
                    this.panel.webview.postMessage({
                        command: 'toolCall',
                        name: toolName,
                        params: toolParams
                    });
                    const toolResult = await (0, tools_1.executeTool)(toolName, toolParams);
                    this.panel.webview.postMessage({
                        command: 'toolResult',
                        name: toolName,
                        result: toolResult
                    });
                    this.messages.push({
                        role: 'tool',
                        content: toolResult
                    });
                }
                this.panel.webview.postMessage({ command: 'startResponse' });
                continue;
            }
            else {
                this.messages.push({ role: 'assistant', content: content });
                break;
            }
        }
        this.panel.webview.postMessage({ command: 'endResponse' });
    }
    getHtmlContent() {
        return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LocalAI Chat</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .header-row {
            display: flex;
            gap: 8px;
        }
        .header-row input, .header-row select {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 10px;
            border-radius: 4px;
        }
        .header-row button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            border-radius: 4px;
            cursor: pointer;
        }
        .header-row button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .message {
            padding: 12px 16px;
            border-radius: 12px;
            line-height: 1.5;
            word-wrap: break-word;
            max-width: 85%;
        }
        .message.user {
            align-self: flex-end;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .message.assistant {
            align-self: flex-start;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            max-width: 90%;
        }
        .message.error {
            background: rgba(255, 80, 80, 0.15);
            border: 1px solid rgba(255, 80, 80, 0.4);
            color: #ff6b6b;
        }
        .message.tool-call {
            background: rgba(100, 180, 255, 0.1);
            border-left: 3px solid #64b4ff;
            padding: 8px 12px;
            font-size: 13px;
        }
        .message.tool-result {
            background: rgba(100, 255, 150, 0.08);
            border-left: 3px solid #64ff96;
            padding: 8px 12px;
            font-size: 12px;
            max-height: none;
            overflow-y: auto;
        }
        .message pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .message code {
            background: rgba(127,127,127,0.2);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        .message pre code {
            background: none;
            padding: 0;
        }
        .input-container {
            padding: 16px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 12px;
        }
        .input-container textarea {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 12px;
            border-radius: 8px;
            resize: none;
            font-family: var(--vscode-font-family);
            min-height: 50px;
            max-height: 150px;
        }
        .input-container button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
        .input-container button:disabled {
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-row">
            <input type="text" id="apiUrl" placeholder="Ollama URL" value="http://localhost:11434">
            <button id="fetchBtn">Model Fetch</button>
        </div>
        <div class="header-row">
            <select id="modelSelect"><option>Model seçin...</option></select>
            <button id="clearBtn">Temizle</button>
        </div>
    </div>
    <div class="chat-container" id="chat">
        <div class="message assistant">Merhaba! Dosya okuma, yazma ve komut çalıştırma yapabilirim. Size nasıl yardımcı olabilirim?</div>
    </div>
    <div class="input-container">
        <textarea id="input" placeholder="Mesajınızı yazın..." rows="2"></textarea>
        <button id="sendBtn">Gönder</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const modelSelect = document.getElementById('modelSelect');
        const apiUrl = document.getElementById('apiUrl');
        const fetchBtn = document.getElementById('fetchBtn');
        const clearBtn = document.getElementById('clearBtn');

        let currentMsg = null;
        let isResponding = false;

        fetchBtn.onclick = () => {
            fetchBtn.disabled = true;
            fetchBtn.textContent = 'Yükleniyor...';
            vscode.postMessage({ command: 'updateApiUrl', url: apiUrl.value.trim() });
        };

        sendBtn.onclick = send;
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        };

        modelSelect.onchange = () => {
            vscode.postMessage({ command: 'selectModel', model: modelSelect.value });
        };

        clearBtn.onclick = () => {
            vscode.postMessage({ command: 'clearChat' });
            chat.innerHTML = '<div class="message assistant">Merhaba! Nasıl yardımcı olabilirim?</div>';
        };

        function send() {
            const text = input.value.trim();
            if (!text || isResponding) return;
            vscode.postMessage({ command: 'sendMessage', text });
            input.value = '';
            input.style.height = 'auto';
        }

        function addMsg(role, content, isHtml) {
            // Skip adding if content is empty or just whitespace
            if (!content || content.trim() === '') return null;
            const div = document.createElement('div');
            div.className = 'message ' + role;
            if (isHtml) div.innerHTML = content;
            else div.textContent = content;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            return div;
        }

        function renderMd(text) {
            text = text.replace(/\`\`\`(\\w*)?\\n?([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
            text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
            text = text.replace(/\\n/g, '<br>');
            return text;
        }

        window.onmessage = (e) => {
            const msg = e.data;
            switch(msg.command) {
                case 'modelList':
                    fetchBtn.disabled = false;
                    fetchBtn.textContent = 'Model Fetch';
                    modelSelect.innerHTML = msg.models.map(m =>
                        '<option value="'+m+'"'+(m===msg.currentModel?' selected':'')+'>'+m+'</option>'
                    ).join('');
                    break;
                case 'addMessage':
                    addMsg(msg.role, msg.content);
                    break;
                case 'startResponse':
                    isResponding = true;
                    sendBtn.disabled = true;
                    currentMsg = document.createElement('div');
                    currentMsg.className = 'message assistant';
                    currentMsg._raw = '';
                    chat.appendChild(currentMsg);
                    break;
                case 'appendToken':
                    if (currentMsg) {
                        currentMsg._raw += msg.token;
                        currentMsg.innerHTML = renderMd(currentMsg._raw);
                        chat.scrollTop = chat.scrollHeight;
                    }
                    break;
                case 'endResponse':
                    if (currentMsg && currentMsg._raw) {
                        currentMsg.innerHTML = renderMd(currentMsg._raw);
                    } else if (currentMsg) {
                        // İçerik yoksa mesajı kaldır
                        currentMsg.remove();
                    }
                    isResponding = false;
                    sendBtn.disabled = false;
                    currentMsg = null;
                    break;
                case 'toolCall':
                    addMsg('tool-call', '🔧 ' + msg.name + (msg.params ? ': ' + JSON.stringify(msg.params) : ''), false);
                    break;
                case 'toolResult':
                    if (!msg.result || msg.result.trim() === '') {
                        break;
                    }
                    const resultHtml = '<pre><code>' + msg.result.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>';
                    addMsg('tool-result', resultHtml, true);
                    break;
                case 'error':
                    isResponding = false;
                    sendBtn.disabled = false;
                    fetchBtn.disabled = false;
                    fetchBtn.textContent = 'Model Fetch';
                    addMsg('error', '❌ ' + msg.text);
                    break;
            }
        };

        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 150) + 'px';
        };
    </script>
</body>
</html>`;
    }
    dispose() {
        ChatPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
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
        console.log('[LocalAI] Chat request:', {
            url,
            model,
            messageCount: messages.length,
            toolCount: tools.length,
            toolNames: tools.map(t => t.function.name)
        });
        // Retry mekanizması - model yüklenirken 500 hatası alınabilir
        const maxRetries = 3;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal,
                });
                if (!response.ok) {
                    // 500 hatası - model yükleniyor olabilir, bekle ve tekrar dene
                    if (response.status === 500 && attempt < maxRetries) {
                        console.log(`[LocalAI] 500 error, retrying in ${attempt * 3}s... (attempt ${attempt}/${maxRetries})`);
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
                    console.log(`[LocalAI] Request failed, retrying in ${attempt * 3}s... (attempt ${attempt}/${maxRetries}):`, error);
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
            console.log('[LocalAI] Non-streaming response:', JSON.stringify(json, null, 2));
            if (json.message?.content) {
                fullContent = json.message.content;
                onToken?.(json.message.content);
            }
            if (json.message?.tool_calls) {
                console.log('[LocalAI] Tool calls received:', JSON.stringify(json.message.tool_calls));
                toolCalls = json.message.tool_calls;
            }
            // Eğer native tool_calls boşsa, content içinden JSON tool call parse etmeyi dene
            if (toolCalls.length === 0 && fullContent) {
                const parsedToolCalls = this.parseToolCallsFromContent(fullContent);
                if (parsedToolCalls.length > 0) {
                    console.log('[LocalAI] Parsed tool calls from content:', JSON.stringify(parsedToolCalls));
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
                            console.log('[LocalAI] Tool calls received:', JSON.stringify(json.message.tool_calls));
                            toolCalls = json.message.tool_calls;
                        }
                    }
                    catch {
                        // Skip invalid JSON lines
                    }
                }
            }
        }
        console.log('[LocalAI] Chat response:', {
            contentLength: fullContent.length,
            toolCallCount: toolCalls.length,
            toolCalls: toolCalls.map(tc => tc.function?.name)
        });
        return { content: fullContent, toolCalls };
    }
    async chat(model, messages, onToken) {
        const result = await this.chatWithTools(model, messages, [], onToken);
        return result.content;
    }
    async listModels() {
        const url = `${this.baseUrl}/api/tags`;
        console.log('[LocalAI] Fetching models from:', url);
        try {
            const response = await fetch(url);
            console.log('[LocalAI] Response status:', response.status);
            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.status}`);
            }
            const data = await response.json();
            console.log('[LocalAI] Models data:', data);
            return data.models?.map(m => m.name) || [];
        }
        catch (err) {
            console.error('[LocalAI] Fetch error:', err);
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
const path = __importStar(__webpack_require__(5));
const fs = __importStar(__webpack_require__(6));
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
    const tempDir = path.join((__webpack_require__(7).tmpdir)(), 'localai-diff');
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
const tempDiffDir = path.join((__webpack_require__(7).tmpdir)(), 'localai-diff');
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
                return `File: ${params.path}\n${'─'.repeat(50)}\n${numberedLines.join('\n')}`;
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
                // Get existing content if file exists
                const oldContent = fs.existsSync(filePath)
                    ? fs.readFileSync(filePath, 'utf-8')
                    : '';
                const newContent = params.content;
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
                const { exec } = __webpack_require__(8);
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
    return `Sen bir kod yazma asistanısın. Kullanıcının istediği uygulamayı TAMAMEN oluşturmalısın.

## DAVRANIŞIN:
1. Kullanıcı bir şey istediğinde, HEMEN tool kullanarak dosya oluştur
2. Yarıda bırakma - tüm dosyaları oluşturana kadar devam et
3. Geri bildirim bekleme - dosyaları oluştur ve devam et
4. Her zaman write_file tool'unu kullan, sadece açıklama yazma

## TOOL KULLANIMI:

### Yeni dosya oluşturmak için:
write_file tool'unu çağır:
- path: dosya yolu (örn: "src/App.tsx")
- content: dosyanın tam içeriği

### Var olan dosyayı düzenlemek için:
1. ÖNCE read_file ile dosyayı oku
2. SONRA edit_file ile değiştir (old_text birebir aynı olmalı)

### Proje yapısını görmek için:
list_files tool'unu kullan

### Komut çalıştırmak için:
run_terminal_command tool'unu kullan

## ÖNEMLİ:
- Her istekte EN AZ BİR tool çağır
- Sadece metin yazma, tool kullan!
- Dosya oluşturmak için write_file KULLANMALISIN

## ÖRNEK:
Kullanıcı: "React todo app yap"

Yapman gereken:
1. write_file(path="src/App.jsx", content="import React...")
2. write_file(path="src/components/TodoList.jsx", content="...")
3. write_file(path="src/App.css", content="...")

SADECE METİN YAZMA - TOOL KULLAN!`;
}
async function executeTool(name, params) {
    const tool = exports.tools.find(t => t.name === name);
    if (!tool) {
        return `Unknown tool: ${name}`;
    }
    return await tool.execute(params);
}


/***/ }),
/* 5 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 6 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("os");

/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 9 */
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
exports.ChatViewProvider = void 0;
const vscode = __importStar(__webpack_require__(1));
const ollama_1 = __webpack_require__(3);
const tools_1 = __webpack_require__(4);
class ChatViewProvider {
    extensionUri;
    static viewType = 'localai.chatView';
    view;
    ollama;
    messages = [];
    agentModel = ''; // Tool calling için (llama3.1 gibi)
    coderModel = ''; // Kod üretimi için (qwen2.5 gibi)
    abortController = null;
    memory;
    currentSession = null;
    waitingForApproval = false; // Agent onay bekliyor mu?
    lastPendingCount = 0; // Son pending edit sayısı
    constructor(extensionUri, memoryService) {
        this.extensionUri = extensionUri;
        this.ollama = new ollama_1.OllamaService();
        this.memory = memoryService;
        // Pending edit değişikliklerini dinle (VSCode toolbar'dan onay için)
        (0, tools_1.onPendingEditsChanged)(() => {
            const currentCount = (0, tools_1.getPendingEditsCount)();
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
    resolveWebviewView(webviewView, _context, _token) {
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
                    const approveResult = await (0, tools_1.applyPendingEdit)(message.editId);
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
                    const rejectResult = await (0, tools_1.rejectPendingEdit)(message.editId);
                    this.view?.webview.postMessage({
                        command: 'editResult',
                        editId: message.editId,
                        result: rejectResult,
                        approved: false
                    });
                    this.updatePendingEditsCount();
                    break;
                case 'approveAllEdits':
                    const approveAllResult = await (0, tools_1.applyAllPendingEdits)();
                    this.view?.webview.postMessage({
                        command: 'bulkEditResult',
                        result: approveAllResult,
                        approved: true
                    });
                    this.updatePendingEditsCount();
                    break;
                case 'rejectAllEdits':
                    const rejectAllResult = (0, tools_1.rejectAllPendingEdits)();
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
    stopGeneration() {
        console.log('[LocalAI] Stop generation requested');
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        // Reset waiting state
        this.waitingForApproval = false;
        // Notify UI
        this.view?.webview.postMessage({ command: 'endResponse' });
        this.view?.webview.postMessage({
            command: 'appendToken',
            token: '\n\n[Durduruldu]'
        });
    }
    async initSession() {
        // Try to load existing session or create new one
        const existingSession = await this.memory.loadCurrentSession();
        if (existingSession) {
            this.currentSession = existingSession;
            this.messages = existingSession.messages;
            this.agentModel = existingSession.model;
        }
        else {
            this.currentSession = await this.memory.createNewSession(this.agentModel);
        }
    }
    async loadSession(sessionId) {
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
    async sendSessionList() {
        if (!this.view)
            return;
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
    async exportHistory() {
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
    async saveCurrentSession() {
        if (this.currentSession) {
            this.currentSession.messages = this.messages;
            this.currentSession.model = this.agentModel;
            await this.memory.saveSession(this.currentSession);
        }
    }
    async handleGetContext(type, value) {
        if (!this.view)
            return;
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
                            if (!content)
                                content = '(No text selected)';
                        }
                    }
                    else if (value === '@file') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            content = editor.document.getText();
                            const fileName = editor.document.fileName;
                            content = `File: ${fileName}\n${'─'.repeat(40)}\n${content}`;
                        }
                    }
                    else if (value === '@terminal') {
                        // Get last terminal output - limited API access
                        content = '(Terminal output capture requires terminal integration)';
                    }
                    else if (value === '@errors') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
                            if (diagnostics.length > 0) {
                                content = diagnostics.map(d => `Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'Error' : 'Warning'}] ${d.message}`).join('\n');
                            }
                            else {
                                content = '(No errors in current file)';
                            }
                        }
                    }
                    break;
                case 'file':
                    const filePath = value.replace('@file:', '');
                    if (workspaceRoot) {
                        const fullPath = (__webpack_require__(5).join)(workspaceRoot, filePath);
                        const fs = __webpack_require__(6);
                        if (fs.existsSync(fullPath)) {
                            content = fs.readFileSync(fullPath, 'utf-8');
                            content = `File: ${filePath}\n${'─'.repeat(40)}\n${content}`;
                        }
                        else {
                            content = `(File not found: ${filePath})`;
                        }
                    }
                    break;
            }
        }
        catch (error) {
            content = `(Error getting context: ${error instanceof Error ? error.message : 'Unknown error'})`;
        }
        this.view.webview.postMessage({
            command: 'contextData',
            value,
            content
        });
    }
    async handleListFiles() {
        if (!this.view)
            return;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            this.view.webview.postMessage({
                command: 'filesList',
                files: ['(No workspace open)']
            });
            return;
        }
        const fs = __webpack_require__(6);
        const path = __webpack_require__(5);
        const files = [];
        const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '__pycache__', '.vscode'];
        function walk(dir, prefix = '') {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.'))
                        continue;
                    if (ignoreDirs.includes(entry.name))
                        continue;
                    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        files.push(`📁 ${relPath}/`);
                        if (files.length < 200) {
                            walk(path.join(dir, entry.name), relPath);
                        }
                    }
                    else {
                        files.push(`📄 ${relPath}`);
                    }
                    if (files.length >= 200)
                        break;
                }
            }
            catch { }
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
    updatePendingEditsCount() {
        if (!this.view)
            return;
        this.view.webview.postMessage({
            command: 'pendingEditsCount',
            count: (0, tools_1.getPendingEditsCount)()
        });
    }
    async sendProjectFiles() {
        if (!this.view)
            return;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return;
        const fs = __webpack_require__(6);
        const path = __webpack_require__(5);
        const files = [];
        const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '__pycache__', '.vscode'];
        function walk(dir, prefix = '') {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.'))
                        continue;
                    if (ignoreDirs.includes(entry.name))
                        continue;
                    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        if (files.length < 100) {
                            walk(path.join(dir, entry.name), relPath);
                        }
                    }
                    else {
                        files.push(relPath);
                    }
                    if (files.length >= 100)
                        break;
                }
            }
            catch { }
        }
        walk(workspaceRoot);
        this.view.webview.postMessage({
            command: 'projectFiles',
            files
        });
    }
    async openFile(filePath, line) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot)
            return;
        const fullPath = vscode.Uri.file(filePath.startsWith('/') || filePath.includes(':')
            ? filePath
            : `${workspaceRoot}/${filePath}`);
        try {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            const editor = await vscode.window.showTextDocument(doc);
            if (line && line > 0) {
                const position = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }
    async sendModelList() {
        if (!this.view)
            return;
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
        }
        catch (error) {
            console.error('[LocalAI] Error fetching models:', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            let userMessage = 'Ollama connection failed';
            if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch')) {
                userMessage = 'Cannot connect to Ollama. Is it running? (ollama serve)';
            }
            else if (errorMsg.includes('404')) {
                userMessage = 'Ollama API not found. Check the URL.';
            }
            else {
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
    async handleUserMessage(text, context) {
        if (!this.view)
            return;
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
        }
        catch (error) {
            if (error.name === 'AbortError') {
                this.view.webview.postMessage({
                    command: 'appendToken',
                    token: '\n\n*[Generation stopped]*'
                });
            }
            else {
                const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
                this.view.webview.postMessage({
                    command: 'error',
                    text: errorMessage
                });
            }
        }
        this.view.webview.postMessage({ command: 'endResponse' });
    }
    async runAgentLoop() {
        if (!this.view)
            return;
        const maxIterations = 10;
        let iteration = 0;
        this.abortController = new AbortController();
        // Agent model yoksa coder model kullan, o da yoksa hata
        const activeAgentModel = this.agentModel || this.coderModel;
        if (!activeAgentModel) {
            throw new Error('Lütfen en az bir model seçin');
        }
        while (iteration < maxIterations) {
            if (this.abortController?.signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            iteration++;
            const messagesWithSystem = [
                { role: 'system', content: (0, tools_1.getSystemPrompt)() },
                ...this.messages
            ];
            const tools = (0, tools_1.getOllamaTools)();
            // Agent model ile tool calling yap
            const { content, toolCalls } = await this.ollama.chatWithTools(activeAgentModel, messagesWithSystem, tools, (token) => {
                this.view?.webview.postMessage({
                    command: 'appendToken',
                    token
                });
            }, this.abortController.signal);
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
                        && (!toolParams.content || toolParams.content.length < 50); // Agent zaten content vermişse skip
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
                    const toolResult = await (0, tools_1.executeTool)(toolName, toolParams);
                    // read_file, write_file ve edit_file sonuçlarını UI'da kısalt
                    let displayResult = toolResult;
                    if (toolName === 'read_file') {
                        displayResult = '✓ dosya okundu';
                    }
                    else if (toolName === 'write_file') {
                        displayResult = '✓ dosya yazıldı';
                    }
                    else if (toolName === 'edit_file') {
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
                        this.lastPendingCount = (0, tools_1.getPendingEditsCount)();
                        console.log('[LocalAI] Waiting for approval, pendingCount:', this.lastPendingCount);
                        this.messages.push({
                            role: 'assistant',
                            content: 'Dosya değişiklikleri diff editörde gösteriliyor. Lütfen değişiklikleri inceleyin ve onaylayın veya reddedin.'
                        });
                        await this.saveCurrentSession();
                        return; // Loop'tan çık
                    }
                }
                this.view.webview.postMessage({ command: 'startResponse' });
                continue;
            }
            else {
                this.messages.push({ role: 'assistant', content: content });
                await this.saveCurrentSession();
                break;
            }
        }
        this.abortController = null;
    }
    // Coder model ile kod üret
    async generateCodeWithCoderModel(toolName, params) {
        if (!this.coderModel)
            return null;
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
            const codeResult = await this.ollama.chatWithTools(this.coderModel, [{ role: 'user', content: coderPrompt }], [], // No tools for code generation
            (token) => {
                // İsteğe bağlı: kod üretimini stream et
            }, this.abortController?.signal // Pass abort signal
            );
            // Markdown code block varsa temizle
            let cleanCode = codeResult.content.trim();
            const codeBlockMatch = cleanCode.match(/```[\w]*\n([\s\S]*?)```/);
            if (codeBlockMatch) {
                cleanCode = codeBlockMatch[1].trim();
            }
            return cleanCode;
        }
        catch (error) {
            console.error('[LocalAI] Coder model error:', error);
            return null;
        }
    }
    // Kullanıcı edit'i onayladıktan sonra agent'ın devam etmesini sağla
    async continueAfterApproval() {
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
        }
        catch (error) {
            console.log('[LocalAI] Agent loop error after approval:', error);
            if (error instanceof DOMException && error.name === 'AbortError') {
                this.view.webview.postMessage({ command: 'endResponse' });
            }
            else {
                console.error('[LocalAI] Continue error:', error);
                this.view.webview.postMessage({
                    command: 'error',
                    text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
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
            padding: 12px;
            font-size: 13px;
        }
        .line {
            margin: 2px 0;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .line.user {
            color: var(--term-green);
        }
        .line.user::before {
            content: '❯ ';
            color: var(--term-green);
        }
        .line.assistant {
            color: #d4d4d4;
            padding-left: 18px;
        }
        .line.error {
            color: var(--term-red);
        }
        .line.error::before {
            content: '✗ ';
        }
        .line.tool {
            color: var(--term-dim);
            font-size: 12px;
            padding-left: 8px;
            border-left: 2px solid var(--term-yellow);
            margin-left: 8px;
            padding-top: 2px;
            padding-bottom: 2px;
        }
        .line.tool .tool-name {
            color: var(--term-yellow);
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
            margin: 4px 0;
            opacity: 0.8;
        }
        .line.agent-thinking .thinking-icon {
            margin-right: 4px;
        }
        .line.tool-result {
            color: var(--term-dim);
            font-size: 11px;
            padding-left: 18px;
            max-height: 200px;
            overflow-y: auto;
            border-left: 2px solid #3c3c3c;
            margin-left: 18px;
            padding: 4px 8px;
            background: #252526;
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
            padding: 8px 12px;
            background: #252526;
            border-top: 1px solid #3c3c3c;
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .input-section::before {
            content: '❯';
            color: var(--term-green);
            font-weight: bold;
        }
        .input-section input {
            flex: 1;
            background: transparent;
            color: #d4d4d4;
            border: none;
            outline: none;
            font-family: inherit;
            font-size: 13px;
        }
        .input-section button {
            background: transparent;
            color: var(--term-dim);
            border: none;
            cursor: pointer;
            font-family: inherit;
            padding: 4px 8px;
        }
        .input-section button:hover {
            color: var(--term-cyan);
        }
        .input-section button.stop {
            color: var(--term-red);
        }
        .generating {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            margin-left: 4px;
            vertical-align: middle;
        }
        .generating span {
            display: inline-block;
            width: 6px;
            height: 6px;
            background: var(--term-green);
            border-radius: 50%;
            animation: wave 1.2s ease-in-out infinite;
        }
        .generating span:nth-child(1) { animation-delay: 0s; }
        .generating span:nth-child(2) { animation-delay: 0.15s; }
        .generating span:nth-child(3) { animation-delay: 0.3s; }
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
    <div class="chat-container" id="chat">
        <div class="line assistant">LocalAI ready. Type a command or ask a question.</div>
    </div>
    <div class="bulk-actions" id="bulkActions">
        <span class="count"><span id="pendingCount">0</span> pending edit(s)</span>
        <button class="approve-all" onclick="approveAllEdits()">✓ Apply All</button>
        <button class="reject-all" onclick="rejectAllEdits()">✗ Reject All</button>
    </div>
    <div class="context-chips" id="contextChips"></div>
    <div class="autocomplete-dropdown" id="autocomplete"></div>
    <div class="input-section">
        <input type="text" id="input" placeholder="ask anything... (@ for context, / for commands)">
        <button id="stopBtn" class="stop" style="display:none">[stop]</button>
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
            if (e.key === 'Enter') { e.preventDefault(); send(); }
        };

        input.oninput = () => {
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

            // Clear context after sending
            contextItems = [];
            renderContextChips();
        }

        function addLine(cls, content, isHtml) {
            const div = document.createElement('div');
            div.className = 'line ' + cls;
            if (isHtml) div.innerHTML = content;
            else div.textContent = content;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
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
                    currentLine = document.createElement('div');
                    currentLine.className = 'line assistant';
                    currentLine._raw = '';
                    currentLine.innerHTML = '<span class="generating"><span></span><span></span><span></span></span><span class="generating-bar"></span>';
                    chat.appendChild(currentLine);
                    chat.scrollTop = chat.scrollHeight;
                    break;
                case 'appendToken':
                    if (currentLine) {
                        currentLine._raw += msg.token;
                        currentLine.innerHTML = renderMd(currentLine._raw) + '<span class="generating"><span></span><span></span><span></span></span>';
                        chat.scrollTop = chat.scrollHeight;
                    }
                    break;
                case 'endResponse':
                    if (currentLine) {
                        if (currentLine._raw && currentLine._raw.trim()) {
                            currentLine.innerHTML = renderMd(currentLine._raw);
                            highlightCode();
                        } else {
                            currentLine.remove();
                        }
                    }
                    isResponding = false;
                    stopBtn.style.display = 'none';
                    currentLine = null;
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
                    isResponding = false;
                    stopBtn.style.display = 'none';
                    fetchBtn.disabled = false;
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
exports.ChatViewProvider = ChatViewProvider;


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