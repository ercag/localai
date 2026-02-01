import * as vscode from 'vscode';
import { OllamaMessage, ToolCall, OllamaTool } from './ollama';

/**
 * vLLM OpenAI-compatible client.
 *
 * Works with vLLM's OpenAI server:
 *   python -m vllm.entrypoints.openai.api_server --model ... --port 8000
 *
 * Endpoints used:
 *   - GET  /v1/models
 *   - POST /v1/chat/completions
 */

type OpenAIRole = 'user' | 'assistant' | 'system' | 'tool';

interface OpenAIMessage {
    role: OpenAIRole;
    content: string | null;
    // OpenAI tool calling
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
}

interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

interface OpenAIChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: OpenAIRole;
            content: string | null;
            tool_calls?: OpenAIToolCall[];
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: {
            role?: OpenAIRole;
            content?: string;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
        };
        finish_reason: string | null;
    }>;
}

interface OpenAIModelsResponse {
    object: string;
    data: Array<{
        id: string;
        object: string;
        created?: number;
        owned_by?: string;
    }>;
}

interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

export class VllmService {
    private baseUrl: string;
    private apiKey?: string;
    private timeoutMs: number;
    private retry: RetryOptions;

    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.apiKey = this.getApiKey();
        this.timeoutMs = this.getTimeoutMs();
        this.retry = this.getRetryOptions();
    }

    /** Re-read settings from VS Code config */
    public updateBaseUrl(): void {
        this.baseUrl = this.getBaseUrl();
        this.apiKey = this.getApiKey();
        this.timeoutMs = this.getTimeoutMs();
        this.retry = this.getRetryOptions();
    }

    public setBaseUrl(url: string): void {
        this.baseUrl = this.normalizeBaseUrl(url);
    }

    public getCurrentUrl(): string {
        return this.baseUrl;
    }

    async isAvailable(): Promise<boolean> {
        try {
            const resp = await this.fetchWithRetry(`${this.baseUrl}/v1/models`, { method: 'GET' });
            return resp.ok;
        } catch {
            return false;
        }
    }

    async listModels(): Promise<string[]> {
        const url = `${this.baseUrl}/v1/models`;
        console.log('[LocalAI/vLLM] Fetching models from:', url);

        const resp = await this.fetchWithRetry(url, { method: 'GET' });
        if (!resp.ok) {
            const body = await this.safeReadText(resp);
            throw new Error(`vLLM listModels failed: ${resp.status} ${resp.statusText}${body ? ` | ${body}` : ''}`);
        }

        const data = (await resp.json()) as OpenAIModelsResponse;
        const models = (data?.data || []).map(m => m.id).filter(Boolean);
        console.log('[LocalAI/vLLM] Models:', models);
        return models;
    }

    async chat(
        model: string,
        messages: OllamaMessage[],
        onToken?: (token: string) => void,
        signal?: AbortSignal
    ): Promise<string> {
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
    async chatWithTools(
        model: string,
        messages: OllamaMessage[],
        tools: OllamaTool[],
        onToken?: (token: string) => void,
        signal?: AbortSignal
    ): Promise<{ content: string; toolCalls: ToolCall[] }> {
        const url = `${this.baseUrl}/v1/chat/completions`;

        // Streaming with tools can be flaky across models/servers.
        // Keep it simple: stream only when no tools.
        const useStreaming = tools.length === 0;

        const openaiMessages = this.toOpenAIMessages(messages);
        const requestBody: Record<string, unknown> = {
            model,
            messages: openaiMessages,
            stream: useStreaming,
        };
        if (tools.length > 0) requestBody.tools = tools;

        console.log('[LocalAI/vLLM] Chat request:', {
            url,
            model,
            messageCount: messages.length,
            toolCount: tools.length,
            toolNames: tools.map(t => t.function.name),
            streaming: useStreaming,
        });

        const resp = await this.fetchWithRetry(
            url,
            {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(requestBody),
            },
            signal
        );

        if (!resp.ok) {
            const body = await this.safeReadText(resp);
            throw new Error(`vLLM API error: ${resp.status} ${resp.statusText}${body ? ` | ${body}` : ''}`);
        }

        return this.processChatResponse(resp, useStreaming, onToken);
    }

    // -----------------------------
    // Internals
    // -----------------------------

    private getBaseUrl(): string {
        const config = vscode.workspace.getConfiguration('localai');
        // Prefer localhost for sanity.
        const configured = config.get<string>('vllmUrl') || 'http://127.0.0.1:8000';
        return this.normalizeBaseUrl(configured);
    }

    private getApiKey(): string | undefined {
        const config = vscode.workspace.getConfiguration('localai');
        const key = config.get<string>('vllmApiKey');
        return key && key.trim().length > 0 ? key.trim() : undefined;
    }

    private getTimeoutMs(): number {
        const config = vscode.workspace.getConfiguration('localai');
        const ms = config.get<number>('vllmTimeoutMs');
        // default: 2 minutes
        return typeof ms === 'number' && ms > 0 ? ms : 120_000;
    }

    private getRetryOptions(): RetryOptions {
        const config = vscode.workspace.getConfiguration('localai');
        const maxRetries = config.get<number>('vllmMaxRetries');
        const baseDelayMs = config.get<number>('vllmRetryBaseDelayMs');
        const maxDelayMs = config.get<number>('vllmRetryMaxDelayMs');

        return {
            maxRetries: typeof maxRetries === 'number' && maxRetries >= 0 ? maxRetries : 3,
            baseDelayMs: typeof baseDelayMs === 'number' && baseDelayMs > 0 ? baseDelayMs : 750,
            maxDelayMs: typeof maxDelayMs === 'number' && maxDelayMs > 0 ? maxDelayMs : 8_000,
        };
    }

    private normalizeBaseUrl(url: string): string {
        const trimmed = (url || '').trim();
        if (!trimmed) return 'http://127.0.0.1:8000';
        // Remove trailing slash
        return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            // OpenAI-style auth header
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    private toOpenAIMessages(messages: OllamaMessage[]): OpenAIMessage[] {
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

            const out: OpenAIMessage = {
                role: m.role,
                content: m.content ?? null,
            };

            // If you ever store tool_calls on assistant messages, keep them compatible.
            if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
                out.tool_calls = m.tool_calls.map((tc, tcIndex) => ({
                    id: `call_${idx}_${tcIndex}`,
                    type: 'function' as const,
                    function: {
                        name: tc.function.name,
                        arguments: JSON.stringify(tc.function.arguments ?? {}),
                    },
                }));
            }

            return out;
        });
    }

    private async processChatResponse(
        response: Response,
        useStreaming: boolean,
        onToken?: (token: string) => void
    ): Promise<{ content: string; toolCalls: ToolCall[] }> {
        let fullContent = '';
        let toolCalls: ToolCall[] = [];

        if (!useStreaming) {
            const json = (await response.json()) as OpenAIChatResponse;
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
        } else {
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Accumulate tool calls (rare in streaming mode here, but supported)
            const streamingToolCalls: Map<number, { name: string; arguments: string }> = new Map();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line.startsWith('data:')) continue;
                    const payload = line.replace(/^data:\s*/, '');
                    if (!payload || payload === '[DONE]') continue;

                    let chunk: OpenAIStreamChunk | null = null;
                    try {
                        chunk = JSON.parse(payload) as OpenAIStreamChunk;
                    } catch {
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
                            if (tc.function?.name) existing.name = tc.function.name;
                            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
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
                                arguments: args as Record<string, string>,
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

    private convertOpenAIToolCalls(openaiToolCalls: OpenAIToolCall[]): ToolCall[] {
        const out: ToolCall[] = [];
        for (const tc of openaiToolCalls) {
            const args = this.safeJsonParse(tc.function.arguments) || {};
            out.push({
                function: {
                    name: tc.function.name,
                    arguments: args as Record<string, string>,
                },
            });
        }
        return out;
    }

    // Parse JSON tool calls from content (fallback for models without native tool_calls)
    private parseToolCallsFromContent(content: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];

        const parseOne = (obj: Record<string, unknown>): ToolCall | null => {
            const name = obj.name as string;
            const args = (obj.arguments || obj.parameters) as Record<string, string>;
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
                        const tc = parseOne(item as Record<string, unknown>);
                        if (tc) toolCalls.push(tc);
                    }
                } else if (parsed && typeof parsed === 'object') {
                    const tc = parseOne(parsed as Record<string, unknown>);
                    if (tc) toolCalls.push(tc);
                }
                if (toolCalls.length > 0) return toolCalls;
            }

            const trimmed = content.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                const parsed = this.safeJsonParse(trimmed);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const tc = parseOne(item as Record<string, unknown>);
                        if (tc) toolCalls.push(tc);
                    }
                } else if (parsed && typeof parsed === 'object') {
                    const tc = parseOne(parsed as Record<string, unknown>);
                    if (tc) toolCalls.push(tc);
                }
            }
        } catch {
            // ignore
        }

        return toolCalls;
    }

    private safeJsonParse(text: string): unknown {
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    private async safeReadText(resp: Response): Promise<string> {
        try {
            return await resp.text();
        } catch {
            return '';
        }
    }

    private async fetchWithRetry(
        url: string,
        init: RequestInit,
        externalSignal?: AbortSignal
    ): Promise<Response> {
        const { maxRetries, baseDelayMs, maxDelayMs } = this.retry;
        let lastError: unknown = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

            const signal = this.mergeSignals(externalSignal, controller.signal);
            try {
                const resp = await fetch(url, {
                    ...init,
                    headers: {
                        ...(init.headers as Record<string, string> | undefined),
                        ...this.buildHeaders(),
                    },
                    signal,
                });

                clearTimeout(timeout);

                // Retry on transient 5xx (common while vLLM is loading a model)
                if (resp.status >= 500 && resp.status <= 599 && attempt < maxRetries) {
                    const delay = this.backoffDelay(attempt, baseDelayMs, maxDelayMs);
                    console.log(`[LocalAI/vLLM] ${resp.status} retry in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                    await this.sleep(delay);
                    continue;
                }

                return resp;
            } catch (err) {
                clearTimeout(timeout);
                lastError = err;

                // External abort should stop immediately
                if (externalSignal?.aborted) throw err;

                // AbortError from timeout: retry if allowed
                const name = (err as { name?: string })?.name;
                if (name === 'AbortError' && attempt >= maxRetries) throw err;

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

    private backoffDelay(attempt: number, base: number, max: number): number {
        // Exponential backoff with jitter
        const exp = Math.min(max, Math.floor(base * Math.pow(2, attempt)));
        const jitter = Math.floor(Math.random() * Math.min(250, exp));
        return Math.min(max, exp + jitter);
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    private mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
        if (!a) return b;
        if (!b) return a;
        // If either aborts, abort the merged controller.
        const controller = new AbortController();
        const onAbort = () => {
            try {
                controller.abort();
            } catch {
                // ignore
            }
        };
        if (a.aborted || b.aborted) {
            onAbort();
        } else {
            a.addEventListener('abort', onAbort, { once: true });
            b.addEventListener('abort', onAbort, { once: true });
        }
        return controller.signal;
    }
}
