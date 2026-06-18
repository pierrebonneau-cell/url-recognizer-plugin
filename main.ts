import { SelectionRange } from "@codemirror/state";
import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	NumberValue,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

// Remember to rename these classes and interfaces!

interface TextToUrlMapping {
	regex: string;
	url: string;
}

interface UrlRecognizerSettings {
	mappings: TextToUrlMapping[];
}

const DEFAULT_SETTINGS: UrlRecognizerSettings = {
	mappings: [
		{
			regex: "[A-Z]+\\-[1-9][0-9]*",
			url: "https://jira.example.com/browse/$&",
		},
	],
};

export default class UrlRecognizerPlugin extends Plugin {
	settings: UrlRecognizerSettings;

	
	convertAllDoc(editor: Editor) {
		let content = editor.getValue();

		for (const mapping of this.settings.mappings) {
			const regex = new RegExp(mapping.regex, "g");

			content = content.replace( regex, match => `[${match}](${mapping.url.replace("$&", match)})` );
		}

		editor.setValue(content);
	}

	convertSelection(editor: Editor) {
		const sel = editor.getSelection();
		if (sel.length > 0) {
			const mapping = this.settings.mappings.find((mapping) =>
				sel.match(new RegExp(mapping.regex))
			);
			if (mapping) {
				const repl = sel.replace(new RegExp(mapping.regex), mapping.url);
				editor.replaceSelection(`[${sel}](${repl})`);
			}
		} else {
			const currentPos = editor.getCursor();
			const line = editor.getLine(currentPos.line);
			const subline = line.substring(0, currentPos.ch);
			const mapping = this.settings.mappings.find((mapping) =>
				subline.search(new RegExp("(?:^|\\s)" + mapping.regex + "$"))
			);
			if (mapping) {
				const regex = new RegExp("(?:^|\\s)(" + mapping.regex + ")$", "g")
				var arr = subline.matchAll(regex);
				if (arr) {
					const toReplace = arr.next().value[1];
					const inner = toReplace.replace(new RegExp(mapping.regex), mapping.url);
					const repl = `[${toReplace}](${inner})`;
					editor.replaceRange(repl, {line: currentPos.line, ch: currentPos.ch - toReplace.length }, currentPos);
				}
			}
		}
	}

	async onload() {
		await this.loadSettings();
		this.addCommand({
			id: 'Change-all',
			name: 'Change all',
			editorCallback: (editor : Editor) => {
				this.convertAllDoc(editor)
			},
		});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "url-recognizer-editor-command",
			name: "Convert to Link",
			icon: "replace",
			hotkeys: [{ modifiers: ['Mod'], key: ' ' }],
			editorCallback: (editor: Editor, view: MarkdownView) =>
				this.convertSelection(editor),
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const sel = editor.getSelection();
				if (sel !== "") {
					menu.addItem((item) => {
						item.setTitle("Convert to Link")
							.setIcon("replace")
							.onClick(async () => {
								this.convertSelection(editor);
							});
					});
				}
			})
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new UrlRecognizerSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		//this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		//	console.log("click", evt);
		//});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		//this.registerInterval(
		//	window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		//);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TextToUrlMappingModal extends Modal {
	regex: string;
	url: string;
	closeAction;

	constructor(
		app: App,
		mapping: TextToUrlMapping,
		closeAction: (mapping: TextToUrlMapping) => void
	) {
		super(app);
		this.regex = mapping.regex;
		this.url = mapping.url;
		this.closeAction = closeAction;
	}

	onOpen() {
		const { contentEl } = this;
		var pref = new Setting(contentEl)
			.setName("Text Pattern")
			.setDesc("Pattern that you want to convert into a link");

		pref.addText((text) =>
			text
				.setPlaceholder("Regex")
				.setValue(this.regex)
				.onChange(async (value) => {
					this.regex = value;
				})
		);
		pref.addText((text) =>
			text
				.setPlaceholder("Replacement URL")
				.setValue(this.url)
				.onChange(async (value) => {
					this.url = value;
				})
		);
	}

	onClose() {
		this.closeAction.call(this, { regex: this.regex, url: this.url });
		const { contentEl } = this;
		contentEl.empty();
	}
}

class UrlRecognizerSettingTab extends PluginSettingTab {
	plugin: UrlRecognizerPlugin;

	constructor(app: App, plugin: UrlRecognizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const { settings } = this.plugin;
		const { mappings } = settings;
		mappings.forEach((mapping) => {
			const { regex, url } = mapping;
			var pref = new Setting(containerEl)
				.setName("URL Pattern")
				.setDesc(
					"Patterns that you want to be able to convert into a link"
				);
			pref.addText((text) =>
				text
					.setPlaceholder("Regex")
					.setValue(`${regex}`)
					.setDisabled(true)
			);
			pref.addText((text) =>
				text
					.setPlaceholder("Replacement URL")
					.setValue(`${url}`)
					.setDisabled(true)
			);
			var index = mappings.indexOf(mapping);
			pref.addButton((button) =>
				button.setButtonText("Edit").onClick(async (value) => {
					new TextToUrlMappingModal(
						this.app,
						{ regex, url },
						(newMapping) => {
							mappings[index] = newMapping;
							this.plugin.saveSettings();
							this.display();
						}
					).open();
				})
			);
			pref.addButton((button) =>
				button.setButtonText("Delete").onClick(async (value) => {
					mappings.remove(mapping);
					this.plugin.saveSettings();
					this.display();
				})
			);
		});
		var pref = new Setting(containerEl)
			.setName("URL Patterns")
			.setDesc(
				"Patterns that you want to be able to convert into a link"
			);
		pref.addButton((button) =>
			button.setButtonText("Add mapping").onClick(async (value) => {
				new TextToUrlMappingModal(
					this.app,
					{ regex: "[A-Z]+", url: "https://example.com/$&" },
					async (mapping) => {
						mappings.push(mapping);
						this.plugin.saveSettings();
						this.display();
					}
				).open();
			})
		);
	}
}
