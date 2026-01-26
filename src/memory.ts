import * as vscode from 'vscode';
import { OllamaMessage } from './ollama';

export interface ChatSession {
    id: string;
    title: string;
    messages: OllamaMessage[];
    model: string;
    createdAt: number;
    updatedAt: number;
}

export interface ProjectMemory {
    // Key files and their purposes
    knownFiles: Map<string, string>;
    // Project summary/notes
    projectNotes: string;
    // Frequently used commands
    commonCommands: string[];
    // Last updated
    updatedAt: number;
}

const CHAT_HISTORY_KEY = 'localai.chatHistory';
const CURRENT_SESSION_KEY = 'localai.currentSession';
const PROJECT_MEMORY_KEY = 'localai.projectMemory';

export class MemoryService {
    private context: vscode.ExtensionContext;
    private currentSession: ChatSession | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // ========== Chat Sessions ==========

    async createNewSession(model: string): Promise<ChatSession> {
        const session: ChatSession = {
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

    getCurrentSession(): ChatSession | null {
        return this.currentSession;
    }

    async loadCurrentSession(): Promise<ChatSession | null> {
        const sessionId = this.context.workspaceState.get<string>(CURRENT_SESSION_KEY);
        if (!sessionId) return null;

        const sessions = await this.getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
        }
        return session || null;
    }

    async saveSession(session: ChatSession): Promise<void> {
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
        } else {
            sessions.unshift(session);
        }

        // Keep only last 50 sessions
        const trimmedSessions = sessions.slice(0, 50);
        await this.context.workspaceState.update(CHAT_HISTORY_KEY, trimmedSessions);

        this.currentSession = session;
    }

    async getAllSessions(): Promise<ChatSession[]> {
        return this.context.workspaceState.get<ChatSession[]>(CHAT_HISTORY_KEY) || [];
    }

    async deleteSession(sessionId: string): Promise<void> {
        const sessions = await this.getAllSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);
        await this.context.workspaceState.update(CHAT_HISTORY_KEY, filtered);

        if (this.currentSession?.id === sessionId) {
            this.currentSession = null;
            await this.context.workspaceState.update(CURRENT_SESSION_KEY, undefined);
        }
    }

    async clearAllSessions(): Promise<void> {
        await this.context.workspaceState.update(CHAT_HISTORY_KEY, []);
        await this.context.workspaceState.update(CURRENT_SESSION_KEY, undefined);
        this.currentSession = null;
    }

    private async saveCurrentSessionId(sessionId: string): Promise<void> {
        await this.context.workspaceState.update(CURRENT_SESSION_KEY, sessionId);
    }

    // ========== Messages ==========

    async addMessage(message: OllamaMessage): Promise<void> {
        if (!this.currentSession) return;

        this.currentSession.messages.push(message);
        await this.saveSession(this.currentSession);
    }

    async getMessages(): Promise<OllamaMessage[]> {
        return this.currentSession?.messages || [];
    }

    async clearCurrentMessages(): Promise<void> {
        if (this.currentSession) {
            this.currentSession.messages = [];
            await this.saveSession(this.currentSession);
        }
    }

    // ========== Project Memory ==========

    async getProjectMemory(): Promise<ProjectMemory | null> {
        const data = this.context.workspaceState.get<any>(PROJECT_MEMORY_KEY);
        if (!data) return null;

        return {
            knownFiles: new Map(Object.entries(data.knownFiles || {})),
            projectNotes: data.projectNotes || '',
            commonCommands: data.commonCommands || [],
            updatedAt: data.updatedAt || Date.now()
        };
    }

    async saveProjectMemory(memory: ProjectMemory): Promise<void> {
        const data = {
            knownFiles: Object.fromEntries(memory.knownFiles),
            projectNotes: memory.projectNotes,
            commonCommands: memory.commonCommands,
            updatedAt: Date.now()
        };
        await this.context.workspaceState.update(PROJECT_MEMORY_KEY, data);
    }

    async addFileNote(filePath: string, note: string): Promise<void> {
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

    async setProjectNotes(notes: string): Promise<void> {
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

    async addCommonCommand(command: string): Promise<void> {
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

    async getContextSummary(): Promise<string> {
        const memory = await this.getProjectMemory();
        if (!memory) return '';

        const parts: string[] = [];

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

    async exportHistory(): Promise<string> {
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

    async importHistory(jsonData: string): Promise<{ sessions: number; success: boolean }> {
        try {
            const data = JSON.parse(jsonData);

            if (data.sessions && Array.isArray(data.sessions)) {
                await this.context.workspaceState.update(CHAT_HISTORY_KEY, data.sessions);
            }

            if (data.projectMemory) {
                const memory: ProjectMemory = {
                    knownFiles: new Map(Object.entries(data.projectMemory.knownFiles || {})),
                    projectNotes: data.projectMemory.projectNotes || '',
                    commonCommands: data.projectMemory.commonCommands || [],
                    updatedAt: Date.now()
                };
                await this.saveProjectMemory(memory);
            }

            return { sessions: data.sessions?.length || 0, success: true };
        } catch {
            return { sessions: 0, success: false };
        }
    }
}
