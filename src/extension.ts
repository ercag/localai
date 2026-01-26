import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel';
import { ChatViewProvider } from './chatViewProvider';
import { MemoryService } from './memory';
import { getPendingEditForFile, applyPendingEdit, rejectPendingEdit, onPendingEditsChanged, getPendingEditsCount, getAllPendingEdits } from './tools';

export function activate(context: vscode.ExtensionContext) {
	console.log('LocalAI extension is now active!');

	// Initialize memory service
	const memoryService = new MemoryService(context);

	// Sidebar view
	const chatViewProvider = new ChatViewProvider(context.extensionUri, memoryService);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ChatViewProvider.viewType,
			chatViewProvider
		)
	);

	// Command to open in editor panel
	const openChatCommand = vscode.commands.registerCommand('localai.openChat', () => {
		ChatPanel.createOrShow(context.extensionUri);
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

	context.subscriptions.push(openChatCommand, applyEditCommand, rejectEditCommand);
}

export function deactivate() {
	if (ChatPanel.currentPanel) {
		ChatPanel.currentPanel.dispose();
	}
}
