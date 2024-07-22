/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	private _disposables = new Set<vscode.Disposable>();
	constructor() {
		super();
		this._disposables.add(vscode.window.registerUriHandler(this));
	}

	handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}

	waitForUri(): Promise<vscode.Uri> {
		return new Promise(resolve => {
			const disposable = this.event(uri => {
				this._disposables.delete(disposable);
				disposable.dispose();
				resolve(uri);
			});
			this._disposables.add(disposable);
		});
	}

	override dispose(): void {
		super.dispose();
		vscode.Disposable.from(...this._disposables).dispose();
	}
}
