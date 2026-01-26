import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OllamaTool } from './ollama';

// Pending edit storage for diff approval
export interface PendingEdit {
    id: string;
    filePath: string;
    relativePath: string;
    oldContent: string;
    newContent: string;
    oldText: string;
    newText: string;
    timestamp: number;
}

let pendingEdits: Map<string, PendingEdit> = new Map();

// Event emitter for pending edits changes
type PendingEditsListener = () => void;
const pendingEditsListeners: PendingEditsListener[] = [];

function notifyPendingEditsChanged(): void {
    pendingEditsListeners.forEach(listener => listener());
}

export function onPendingEditsChanged(listener: PendingEditsListener): vscode.Disposable {
    pendingEditsListeners.push(listener);
    return new vscode.Disposable(() => {
        const index = pendingEditsListeners.indexOf(listener);
        if (index >= 0) {
            pendingEditsListeners.splice(index, 1);
        }
    });
}

export function getPendingEdit(id: string): PendingEdit | undefined {
    return pendingEdits.get(id);
}

// Get pending edit by file path (checks temp files too)
export function getPendingEditForFile(filePath: string): PendingEdit | undefined {
    // Check if this is a temp diff file
    const tempDir = path.join(require('os').tmpdir(), 'localai-diff');
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

export function clearPendingEdit(id: string): void {
    pendingEdits.delete(id);
    notifyPendingEditsChanged();
}

export async function applyPendingEdit(id: string): Promise<string> {
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
    } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Could not apply edit'}`;
    }
}

export async function rejectPendingEdit(id: string): Promise<string> {
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

export function getAllPendingEdits(): PendingEdit[] {
    return Array.from(pendingEdits.values());
}

export async function applyAllPendingEdits(): Promise<string> {
    const edits = getAllPendingEdits();
    if (edits.length === 0) {
        return 'No pending edits to apply';
    }

    const results: string[] = [];
    for (const edit of edits) {
        try {
            fs.writeFileSync(edit.filePath, edit.newContent, 'utf-8');
            pendingEdits.delete(edit.id);
            cleanupTempFiles(edit.id);
            await closeDiffEditors(edit.id);
            results.push(`✓ ${edit.relativePath}`);
        } catch (error) {
            results.push(`✗ ${edit.relativePath}: ${error instanceof Error ? error.message : 'Failed'}`);
        }
    }

    return `Applied ${results.filter(r => r.startsWith('✓')).length}/${edits.length} edits:\n${results.join('\n')}`;
}

export async function rejectAllPendingEdits(): Promise<string> {
    const edits = getAllPendingEdits();
    const count = edits.length;

    for (const edit of edits) {
        cleanupTempFiles(edit.id);
        await closeDiffEditors(edit.id);
    }

    pendingEdits.clear();
    return `✗ Rejected ${count} pending edit(s)`;
}

export function getPendingEditsCount(): number {
    return pendingEdits.size;
}

// Temp directory for diff files
const tempDiffDir = path.join(require('os').tmpdir(), 'localai-diff');

// Ensure temp dir exists
function ensureTempDir(): void {
    if (!fs.existsSync(tempDiffDir)) {
        fs.mkdirSync(tempDiffDir, { recursive: true });
    }
}

// Show VSCode native diff editor
async function showVSCodeDiff(editId: string, filePath: string, relativePath: string, oldContent: string, newContent: string): Promise<void> {
    ensureTempDir();

    // Create temp files for diff
    const originalFile = path.join(tempDiffDir, `${editId}_original${path.extname(filePath)}`);
    const modifiedFile = path.join(tempDiffDir, `${editId}_modified${path.extname(filePath)}`);

    fs.writeFileSync(originalFile, oldContent, 'utf-8');
    fs.writeFileSync(modifiedFile, newContent, 'utf-8');

    const originalUri = vscode.Uri.file(originalFile);
    const modifiedUri = vscode.Uri.file(modifiedFile);

    // Open VSCode diff editor
    await vscode.commands.executeCommand('vscode.diff',
        originalUri,
        modifiedUri,
        `${relativePath} (Proposed Changes - ${editId.slice(-6)})`
    );
}

// Clean up temp files for an edit
function cleanupTempFiles(editId: string): void {
    try {
        const files = fs.readdirSync(tempDiffDir);
        files.filter(f => f.startsWith(editId)).forEach(f => {
            fs.unlinkSync(path.join(tempDiffDir, f));
        });
    } catch {
        // Ignore cleanup errors
    }
}

// Close diff editor tabs for a specific edit
async function closeDiffEditors(editId: string): Promise<void> {
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
function generateDiffSummary(oldText: string, newText: string, filePath: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    let additions = 0;
    let deletions = 0;

    // Count changed lines
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
        if (oldLines[i] !== newLines[i]) {
            if (oldLines[i] !== undefined) deletions++;
            if (newLines[i] !== undefined) additions++;
        }
    }

    return `📝 ${filePath}: +${additions} -${deletions} lines`;
}

export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, { type: string; description: string }>;
        required: string[];
    };
    execute: (params: Record<string, string>) => Promise<string>;
}

// Parametre normalizasyonu - modeller farklı isimler kullanabilir
function normalizeParams(params: Record<string, string>): Record<string, string> {
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

export const tools: Tool[] = [
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
                const numberedLines = selectedLines.map((line, i) =>
                    `${(startLine + i + 1).toString().padStart(4)}: ${line}`
                );

                return `File: ${params.path}\n${'─'.repeat(50)}\n${numberedLines.join('\n')}`;
            } catch (error) {
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
                const pendingEdit: PendingEdit = {
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
            } catch (error) {
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
                const pendingEdit: PendingEdit = {
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
            } catch (error) {
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

            function listDir(dir: string, prefix: string = '', depth: number = 0): string[] {
                if (depth > 3) return [];

                const entries = fs.readdirSync(dir, { withFileTypes: true });
                const results: string[] = [];

                for (const entry of entries) {
                    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
                    if (ignoreDirs.includes(entry.name)) continue;

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
            } catch (error) {
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
            const results: string[] = [];
            const maxResults = 50;

            const ignoreDirs = ['node_modules', '.git', 'dist', 'out', '__pycache__'];

            function searchInDir(dir: string) {
                if (results.length >= maxResults) return;

                const entries = fs.readdirSync(dir, { withFileTypes: true });

                for (const entry of entries) {
                    if (results.length >= maxResults) break;
                    if (ignoreDirs.includes(entry.name)) continue;
                    if (entry.name.startsWith('.')) continue;

                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        searchInDir(fullPath);
                    } else if (entry.isFile()) {
                        // Check file pattern
                        if (params.file_pattern) {
                            const ext = params.file_pattern.replace('*', '');
                            if (!entry.name.endsWith(ext)) continue;
                        }

                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            const lines = content.split('\n');
                            const regex = new RegExp(params.pattern, 'gi');

                            lines.forEach((line, i) => {
                                if (results.length >= maxResults) return;
                                if (regex.test(line)) {
                                    const relPath = path.relative(workspaceRoot!, fullPath);
                                    results.push(`${relPath}:${i + 1}: ${line.trim()}`);
                                }
                                regex.lastIndex = 0; // Reset regex
                            });
                        } catch {
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
            } catch (error) {
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
            const numberedLines = lines.map((line, i) =>
                `${(i + 1).toString().padStart(4)}: ${line}`
            );
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
                const { exec } = require('child_process');
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

                exec(params.command, { cwd: workspaceRoot, timeout: 30000 }, (error: Error | null, stdout: string, stderr: string) => {
                    if (error) {
                        resolve(`Error: ${error.message}\n${stderr}`);
                    } else {
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

                const diff: string[] = [`Diff for ${params.path}:`, '─'.repeat(50)];

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
            } catch (error) {
                return `Error: ${error instanceof Error ? error.message : 'Could not generate diff'}`;
            }
        }
    }
];

// Convert to Ollama tool format
export function getOllamaTools(): OllamaTool[] {
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }
    }));
}

// System prompt for tool-enabled chat
export function getSystemPrompt(): string {
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

export async function executeTool(name: string, params: Record<string, string>): Promise<string> {
    const tool = tools.find(t => t.name === name);
    if (!tool) {
        return `Unknown tool: ${name}`;
    }
    return await tool.execute(params);
}
