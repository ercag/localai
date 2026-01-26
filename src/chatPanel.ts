import * as vscode from 'vscode';
import { OllamaService, OllamaMessage } from './ollama';
import { getOllamaTools, getSystemPrompt, executeTool } from './tools';

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly ollama: OllamaService;
    private messages: OllamaMessage[] = [];
    private currentModel: string = '';
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.ollama = new OllamaService();

        this.panel.webview.html = this.getHtmlContent();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
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
            },
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri): ChatPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.panel.reveal(column);
            return ChatPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'localaiChat',
            'LocalAI Chat',
            column || vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
        return ChatPanel.currentPanel;
    }

    private async sendModelList(): Promise<void> {
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
        } catch (error) {
            this.panel.webview.postMessage({
                command: 'error',
                text: 'Ollama bağlantısı kurulamadı'
            });
        }
    }

    private async handleUserMessage(text: string): Promise<void> {
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
            this.panel.webview.postMessage({
                command: 'error',
                text: errorMessage
            });
        }
    }

    private async runAgentLoop(): Promise<void> {
        const maxIterations = 10;
        let iteration = 0;

        while (iteration < maxIterations) {
            iteration++;

            const messagesWithSystem: OllamaMessage[] = [
                { role: 'system', content: getSystemPrompt() },
                ...this.messages
            ];

            const tools = getOllamaTools();

            const { content, toolCalls } = await this.ollama.chatWithTools(
                this.currentModel,
                messagesWithSystem,
                tools,
                (token) => {
                    this.panel.webview.postMessage({
                        command: 'appendToken',
                        token
                    });
                }
            );

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

                    const toolResult = await executeTool(toolName, toolParams);

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
            } else {
                this.messages.push({ role: 'assistant', content: content });
                break;
            }
        }

        this.panel.webview.postMessage({ command: 'endResponse' });
    }

    private getHtmlContent(): string {
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

    public dispose(): void {
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
