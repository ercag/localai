import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel';
import { MemoryService } from './memory';
import { getPendingEditForFile, applyPendingEdit, rejectPendingEdit, onPendingEditsChanged, getPendingEditsCount, getAllPendingEdits } from './tools';

// Status bar item for showing generation status
let statusBarItem: vscode.StatusBarItem;

// Memory service (shared with ChatPanel)
let memoryService: MemoryService;

// Output channel for logging
export let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	// Create output channel
	outputChannel = vscode.window.createOutputChannel('LocalAI');
	context.subscriptions.push(outputChannel);
	outputChannel.appendLine('LocalAI extension activated');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.name = 'LocalAI Status';
	context.subscriptions.push(statusBarItem);

	// Initialize memory service
	memoryService = new MemoryService(context);

	// Command to open chat in editor panel
	const openChatCommand = vscode.commands.registerCommand('localai.openChat', () => {
		ChatPanel.createOrShow(context.extensionUri, memoryService);
	});

	// Apply edit command (for diff editor toolbar)
	const applyEditCommand = vscode.commands.registerCommand('localai.applyEdit', async () => {
		// Önce aktif editor'dan bulmayı dene
		const activeEditor = vscode.window.activeTextEditor;
		let pendingEdit = activeEditor ? getPendingEditForFile(activeEditor.document.uri.fsPath) : undefined;

		// Bulunamadıysa, en son pending edit'i al
		if (!pendingEdit) {
			const allEdits = getAllPendingEdits();
			if (allEdits.length > 0) {
				pendingEdit = allEdits[allEdits.length - 1];
			}
		}

		if (pendingEdit) {
			const result = await applyPendingEdit(pendingEdit.id);
			vscode.window.showInformationMessage(result);
			updatePendingEditContext();
		} else {
			vscode.window.showWarningMessage('No pending edit found');
		}
	});

	// Reject edit command (for diff editor toolbar)
	const rejectEditCommand = vscode.commands.registerCommand('localai.rejectEdit', async () => {
		// Önce aktif editor'dan bulmayı dene
		const activeEditor = vscode.window.activeTextEditor;
		let pendingEdit = activeEditor ? getPendingEditForFile(activeEditor.document.uri.fsPath) : undefined;

		// Bulunamadıysa, en son pending edit'i al
		if (!pendingEdit) {
			const allEdits = getAllPendingEdits();
			if (allEdits.length > 0) {
				pendingEdit = allEdits[allEdits.length - 1];
			}
		}

		if (pendingEdit) {
			const result = await rejectPendingEdit(pendingEdit.id);
			vscode.window.showInformationMessage(result);
			updatePendingEditContext();
		} else {
			vscode.window.showWarningMessage('No pending edit found');
		}
	});

	// Update context when pending edits change
	function updatePendingEditContext() {
		// Herhangi bir pending edit varsa butonları göster
		const hasPending = getPendingEditsCount() > 0;
		vscode.commands.executeCommand('setContext', 'localai.hasPendingEdit', hasPending);
	}

	// Listen to editor changes to update context
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			updatePendingEditContext();
		})
	);

	// Listen to pending edits changes
	context.subscriptions.push(
		onPendingEditsChanged(() => {
			updatePendingEditContext();
		})
	);

	// Stop generation command (for status bar click)
	const stopGenerationCommand = vscode.commands.registerCommand('localai.stopGeneration', () => {
		// ChatPanel'a stop mesajı gönder
		if (ChatPanel.currentPanel) {
			ChatPanel.currentPanel.stopGeneration();
		}
	});

	context.subscriptions.push(openChatCommand, applyEditCommand, rejectEditCommand, stopGenerationCommand);
}

export function deactivate() {
	if (ChatPanel.currentPanel) {
		ChatPanel.currentPanel.dispose();
	}
}

// Status bar update functions
export function showGeneratingStatus(model: string): void {
	if (statusBarItem) {
		statusBarItem.text = `$(sync~spin) LocalAI: Generating...`;
		statusBarItem.tooltip = `Model: ${model}\nClick to stop`;
		statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		statusBarItem.command = 'localai.stopGeneration';
		statusBarItem.show();
	}
}

export function updateGeneratingStatus(elapsed: number): void {
	if (statusBarItem) {
		statusBarItem.text = `$(sync~spin) LocalAI: ${elapsed}s`;
		if (elapsed >= 60) {
			statusBarItem.text = `$(warning) LocalAI: ${elapsed}s - slow response`;
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		}
	}
}

export function hideGeneratingStatus(): void {
	if (statusBarItem) {
		statusBarItem.hide();
	}
}

export function showReadyStatus(): void {
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
