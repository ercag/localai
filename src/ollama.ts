import * as vscode from 'vscode';

export interface OllamaMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
}

export interface ToolCall {
    function: {
        name: string;
        arguments: Record<string, string>;
    };
}

export interface OllamaTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: Record<string, { type: string; description: string }>;
            required: string[];
        };
    };
}

interface OllamaChatResponse {
    message: {
        role: string;
        content: string;
        tool_calls?: ToolCall[];
    };
    done: boolean;
}

export class OllamaService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = this.getBaseUrl();
    }

    private getBaseUrl(): string {
        const config = vscode.workspace.getConfiguration('localai');
        return config.get<string>('ollamaUrl') || 'http://localhost:11434';
    }

    public updateBaseUrl(): void {
        this.baseUrl = this.getBaseUrl();
    }

    public setBaseUrl(url: string): void {
        this.baseUrl = url;
    }

    public getCurrentUrl(): string {
        return this.baseUrl;
    }

    async chatWithTools(
        model: string,
        messages: OllamaMessage[],
        tools: OllamaTool[],
        onToken?: (token: string) => void,
        signal?: AbortSignal
    ): Promise<{ content: string; toolCalls: ToolCall[] }> {
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
        let lastError: Error | null = null;

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
            } catch (error) {
                lastError = error as Error;

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

    private async processResponse(
        response: Response,
        useStreaming: boolean,
        onToken?: (token: string) => void
    ): Promise<{ content: string; toolCalls: ToolCall[] }> {

        let fullContent = '';
        let toolCalls: ToolCall[] = [];

        if (!useStreaming) {
            // Non-streaming: tek bir JSON response
            const json = await response.json() as OllamaChatResponse;
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
        } else {
            // Streaming: satır satır JSON
            if (!response.body) {
                throw new Error('No response body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const json: OllamaChatResponse = JSON.parse(line);
                        if (json.message?.content) {
                            fullContent += json.message.content;
                            onToken?.(json.message.content);
                        }
                        if (json.message?.tool_calls) {
                            console.log('[LocalAI] Tool calls received:', JSON.stringify(json.message.tool_calls));
                            toolCalls = json.message.tool_calls;
                        }
                    } catch {
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

    async chat(
        model: string,
        messages: OllamaMessage[],
        onToken?: (token: string) => void
    ): Promise<string> {
        const result = await this.chatWithTools(model, messages, [], onToken);
        return result.content;
    }

    async listModels(): Promise<string[]> {
        const url = `${this.baseUrl}/api/tags`;
        console.log('[LocalAI] Fetching models from:', url);

        try {
            const response = await fetch(url);
            console.log('[LocalAI] Response status:', response.status);

            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.status}`);
            }

            const data = await response.json() as { models: Array<{ name: string }> };
            console.log('[LocalAI] Models data:', data);
            return data.models?.map(m => m.name) || [];
        } catch (err) {
            console.error('[LocalAI] Fetch error:', err);
            throw err;
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }

    // Content içinden JSON tool call'larını parse et
    // Bazı modeller native tool_calls yerine content içinde JSON döndürüyor
    private parseToolCallsFromContent(content: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];

        // Helper: tek bir tool call objesini parse et
        const parseToolCall = (obj: Record<string, unknown>): ToolCall | null => {
            const name = obj.name as string;
            // arguments veya parameters olabilir
            const args = (obj.arguments || obj.parameters) as Record<string, string>;
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
                        if (tc) toolCalls.push(tc);
                    }
                } else {
                    const tc = parseToolCall(parsed);
                    if (tc) toolCalls.push(tc);
                }
                if (toolCalls.length > 0) return toolCalls;
            }

            // 2. Content içinde { ile başlayan JSON objesi ara
            const jsonObjectMatch = content.match(/\{[\s\S]*"name"\s*:\s*"(\w+)"[\s\S]*\}/);
            if (jsonObjectMatch) {
                try {
                    const parsed = JSON.parse(jsonObjectMatch[0]);
                    const tc = parseToolCall(parsed);
                    if (tc) toolCalls.push(tc);
                    if (toolCalls.length > 0) return toolCalls;
                } catch {
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
                        if (tc) toolCalls.push(tc);
                    }
                } else {
                    const tc = parseToolCall(parsed);
                    if (tc) toolCalls.push(tc);
                }
            }
        } catch {
            // JSON parse hatası - tool call yok
        }

        return toolCalls;
    }
}
