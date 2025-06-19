import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

/**
 * @file Main plugin file for Intelligent RTL Management.
 * @author AI Assistant (Jules)
 */

// Conceptual import from rtl-text-detector.js
// In a real build process, these would be imported via modules.
// For this simulation, assume getBlockDirection is globally available
// or defined in this file if rtl-text-detector.js isn't actually created separately.
// declare function getBlockDirection(text: string): 'rtl' | 'ltr';


/**
 * Defines the direction setting for a UI container.
 * 'auto' would imply using text content analysis or global default.
 */
type DirectionSetting = 'ltr' | 'rtl' | 'auto';

/**
 * Settings for an individual UI container that can have its direction managed.
 */
interface UiContainerSettings {
	direction: DirectionSetting;
}

/**
 * Interface for the Intelligent RTL Management plugin settings.
 */
interface IntelligentRtlSettings {
	/** Global default direction for containers set to 'auto' or when specific settings are not applied. */
	globalDefaultDirection: DirectionSetting;
	/** Settings for the main editor component. */
	editor: UiContainerSettings;
	/** Settings for the left sidebar. */
	leftSidebar: UiContainerSettings;
	/** Settings for the right sidebar. */
	rightSidebar: UiContainerSettings;
	/** Settings for the file explorer pane. */
	fileExplorer: UiContainerSettings;
	/** Settings for the search results pane. */
	searchResults: UiContainerSettings;
	/** Settings for the tag pane. */
	tagPane: UiContainerSettings;
	/** Settings for individual cards within Canvas. */
	canvasCard: UiContainerSettings;
	/** Whether to enable advanced text-based direction detection for 'auto' mode. */
	enableAdvancedTextDetection: boolean;
	/** A sample setting, can be adapted or removed. */
	mySetting: string; // Kept for compatibility, can be removed
}

/**
 * Default settings for the Intelligent RTL Management Plugin.
 */
const DEFAULT_SETTINGS: IntelligentRtlSettings = {
	globalDefaultDirection: 'auto',
	editor: { direction: 'auto' },
	leftSidebar: { direction: 'ltr' },
	rightSidebar: { direction: 'ltr' },
	fileExplorer: { direction: 'ltr' },
	searchResults: { direction: 'auto' },
	tagPane: { direction: 'auto' },
	canvasCard: { direction: 'auto' },
	enableAdvancedTextDetection: true,
	mySetting: 'default'
};

/**
 * Main plugin class for Intelligent RTL Management.
 */
export default class IntelligentRtlPlugin extends Plugin {
	settings: IntelligentRtlSettings;
	editorMutationObserver: MutationObserver | null = null;
	observedEditorElements: Set<Element> = new Set();
	debouncedHandleEditorMutation: ((mutations: MutationRecord[], observer: MutationObserver) => void) | null = null;
	activeNoteOverride: DirectionSetting | null = null;
	statusBarItemEl: HTMLElement | null = null;
	canvasObserver: MutationObserver | null = null;
	observedCanvasContainers: Set<Element> = new Set();

	async onload() {
		await this.loadSettings();
		this.applyAllUiSettings();

		// Debounced handler for editor mutations.
		// Performance: Debouncing is critical here to avoid excessive processing during rapid typing.
		this.debouncedHandleEditorMutation = this.debounce(this.handleEditorMutationInner.bind(this), 500);
		this.editorMutationObserver = new MutationObserver((mutations, observer) => {
			if (this.debouncedHandleEditorMutation) {
				this.debouncedHandleEditorMutation(mutations, observer);
			}
		});

		// Mutation observer for new canvas cards.
		// Performance: Canvas card additions are generally less frequent than text edits.
		this.canvasObserver = new MutationObserver(this.handleCanvasMutation.bind(this));

		this.registerEvent(this.app.workspace.on('file-open', async (file) => await this.handleFileOpen(file) ));
		this.registerEvent(this.app.workspace.on('active-leaf-change', async (leaf) => {
			if (leaf && leaf.view instanceof MarkdownView && leaf.view.file) {
				await this.handleFileOpen(leaf.view.file);
			} else {
				this.clearActiveNoteOverrideAndRefreshEditor();
			}
		}));

		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.addClass('mod-clickable');
		this.statusBarItemEl.setAttribute('aria-label', 'Change note text direction');
		this.statusBarItemEl.setAttribute('aria-live', 'polite');
		this.statusBarItemEl.addEventListener('click', async () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile || activeFile.extension !== 'md') {
				new Notice("Open a markdown note to change its direction.");
				return;
			}
			let nextDirection: DirectionSetting | null = 'ltr'; // Default starting point for cycle
			const currentOverride = this.activeNoteOverride;
			if (currentOverride === 'ltr') nextDirection = 'rtl';
			else if (currentOverride === 'rtl') nextDirection = 'auto';
			else if (currentOverride === 'auto') nextDirection = null;
			await this.setNoteDirection(nextDirection);
		});

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			await this.handleFileOpen(activeFile);
		} else {
			this.updateStatusBarIndicator();
		}

		this.addCommands();
		this.addSettingTab(new IntelligentRtlSettingTab(this.app, this));
		console.log("Intelligent RTL Plugin loaded.");
	}

	onunload() {
		if (this.editorMutationObserver) this.editorMutationObserver.disconnect();
		this.observedEditorElements.clear();
		this.editorMutationObserver = null;

		if (this.canvasObserver) this.canvasObserver.disconnect();
		this.observedCanvasContainers.clear();
		this.canvasObserver = null;

		console.log("Intelligent RTL Plugin unloaded.");
	}

	addCommands() {
        const commands = [
            { id: 'set-note-direction-rtl', name: 'Set current note to RTL', dir: 'rtl' as DirectionSetting },
            { id: 'set-note-direction-ltr', name: 'Set current note to LTR', dir: 'ltr' as DirectionSetting },
            { id: 'set-note-direction-auto', name: 'Set current note to Auto-Detect direction', dir: 'auto' as DirectionSetting },
            { id: 'clear-note-direction-override', name: 'Clear current note direction override', dir: null }
        ];
        commands.forEach(cmd => {
            this.addCommand({ id: cmd.id, name: cmd.name, callback: async () => await this.setNoteDirection(cmd.dir) });
        });
    }

	debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
		let timeoutId: number | null = null;
		return (...args: Parameters<T>) => {
			if (timeoutId !== null) window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => func(...args), delay);
		};
	}

	handleEditorMutationInner(mutations: MutationRecord[], observer: MutationObserver) {
		// Performance: This handler is debounced.
		// It processes mutations for observed editor content elements.
		// Selector Stability: Relies on '.cm-content' for editor content area.
		try {
			const changedEditorElements: Set<Element> = new Set();
			for (const mutation of mutations) {
				let targetNode = mutation.target;
				while (targetNode && targetNode !== document.body) { // Boundary condition
					if (targetNode instanceof Element && targetNode.classList.contains('cm-content') && this.observedEditorElements.has(targetNode)) {
						changedEditorElements.add(targetNode);
						break;
					}
					targetNode = targetNode.parentNode;
				}
			}

			changedEditorElements.forEach(editorContentElement => {
				const activeFile = this.app.workspace.getActiveFile();
				const owningLeaf = Array.from(this.app.workspace.getLeavesOfType(MarkdownView)).find(
					l => l.view.containerEl && l.view.containerEl.querySelector('.cm-content') === editorContentElement
				);

				if (!(activeFile && owningLeaf && owningLeaf.view.file === activeFile)) {
					return; // Only process for the active editor linked to the active file
				}

				let userDirectionForThisEditor = this.settings.editor.direction;
				if (this.activeNoteOverride !== null) {
					userDirectionForThisEditor = this.activeNoteOverride;
				}

				if (userDirectionForThisEditor === 'auto' && this.settings.enableAdvancedTextDetection) {
					const textContent = editorContentElement.textContent || "";
					const detectedDir = getBlockDirection(textContent);
					const currentEffectiveDir = editorContentElement.getAttribute('data-effective-direction');
					if (currentEffectiveDir !== detectedDir) {
						editorContentElement.setAttribute('data-effective-direction', detectedDir);
						editorContentElement.classList.remove('ltr-mode', 'rtl-mode');
						editorContentElement.classList.add(`${detectedDir}-mode`);
					}
				}
			});
		} catch (error) {
			console.error("Error in handleEditorMutationInner:", error);
		}
	}

	handleCanvasMutation(mutations: MutationRecord[], observer: MutationObserver) {
		// Performance: Not currently debounced. Consider if canvas interactions become very frequent.
		try {
			for (const mutation of mutations) {
				if (mutation.type === 'childList') {
					mutation.addedNodes.forEach(node => {
						if (node instanceof HTMLElement && node.classList.contains('canvas-card')) {
							const cardContent = node.querySelector('.canvas-card-content') || node.querySelector('.canvas-card-text') || node;
							if (cardContent) {
								this.applyDirectionToElement(cardContent as HTMLElement, this.settings.canvasCard.direction, 'new-canvas-card');
								// applyDirectionToElement handles initial detection for 'auto' if enabled
							}
						}
					});
				}
			}
		} catch (error), {
			console.error("Error in handleCanvasMutation:", error);
		}
	}

	async handleFileOpen(file: import('obsidian').TFile | null) {
		try {
			if (file && file.extension === 'md') {
				const fileCache = this.app.metadataCache.getFileCache(file);
				const fm = fileCache?.frontmatter;
				const directionFromFm = fm?.direction as DirectionSetting | undefined;
				this.activeNoteOverride = (directionFromFm && ['ltr', 'rtl', 'auto'].includes(directionFromFm)) ? directionFromFm : null;
			} else {
				this.activeNoteOverride = null;
			}
		} catch (e) {
			console.error("Error reading frontmatter:", e);
			this.activeNoteOverride = null;
		}
		this.refreshActiveEditorDirection();
		this.updateStatusBarIndicator();
	}

	clearActiveNoteOverrideAndRefreshEditor() {
		const needsUpdate = this.activeNoteOverride !== null;
		this.activeNoteOverride = null;
		if (needsUpdate) this.refreshActiveEditorDirection();
		this.updateStatusBarIndicator();
	}

	async updateNoteFrontmatterDirection(file: import('obsidian').TFile, direction: DirectionSetting | null) {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (direction === null) delete fm.direction;
				else fm.direction = direction;
			});
		} catch (e) {
			console.error("Error updating frontmatter:", e);
			new Notice("Error updating note direction in frontmatter.");
		}
	}

	async setNoteDirection(direction: DirectionSetting | null) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice(activeFile ? "Direction can only be set for Markdown files." : "No active file.");
			return;
		}
		this.activeNoteOverride = direction;
		await this.updateNoteFrontmatterDirection(activeFile, direction);
		this.refreshActiveEditorDirection();
		this.updateStatusBarIndicator();
		new Notice(`Note direction ${direction ? 'set to ' + direction.toUpperCase() : 'override cleared'}.`);
	}

	refreshActiveEditorDirection() {
		// Performance: Called on file open, leaf change, and after setting note direction.
		// Targets only the active editor.
		try {
			const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeLeaf && activeLeaf.view.file) {
				const editorContentElement = activeLeaf.view.containerEl.querySelector('.cm-content') as HTMLElement | null;
				if (editorContentElement) {
					const directionToApply = this.activeNoteOverride || this.settings.editor.direction;
					this.applyDirectionToElement(editorContentElement, directionToApply, `active-editor-${activeLeaf.view.file.basename}`);
					if (directionToApply === 'auto' && this.settings.enableAdvancedTextDetection && this.editorMutationObserver && this.observedEditorElements.has(editorContentElement)) {
						this.handleEditorMutationInner([{target: editorContentElement} as unknown as MutationRecord], this.editorMutationObserver);
					}
				}
			}
		} catch (e) {
			console.error("Error refreshing active editor direction:", e);
		}
	}

	updateStatusBarIndicator() {
		if (!this.statusBarItemEl) return;
		try {
			const activeFile = this.app.workspace.getActiveFile();
			let text = 'Dir: N/A';
			let ariaLabel = 'Note text direction: Not applicable';
			if (activeFile && activeFile.extension === 'md') {
				const currentDir = this.activeNoteOverride || this.settings.editor.direction;
				const type = this.activeNoteOverride ? 'Note' : 'Default';
				text = `Dir: ${currentDir.toUpperCase()} (${type})`;
				ariaLabel = `Note text direction: ${currentDir.toUpperCase()} (${type})`;
			}
			this.statusBarItemEl.setText(text);
			this.statusBarItemEl.setAttribute('aria-label', ariaLabel);
		} catch (e) {
			console.error("Error updating status bar:", e);
		}
	}

	applyAllUiSettings() {
		// Performance: Iterates all leaves and UI components. Called on load and global settings change.
		// Selector Stability: Relies on Obsidian's DOM structure. Prone to breakage with updates.
		console.log("Applying all UI settings...", this.settings);
		try {
			const currentEditorCMContentElements = new Set<Element>();
			const currentCanvasViewContentElements = new Set<Element>(); // Tracks .canvas-nodes elements

			this.app.workspace.iterateAllLeaves(leaf => {
				try {
					if (leaf.view instanceof MarkdownView) {
						const editorCMContent = leaf.view.containerEl.querySelector('.cm-content') as HTMLElement | null;
						if (editorCMContent) {
							currentEditorCMContentElements.add(editorCMContent);
							let dir = this.settings.editor.direction;
							const activeFile = this.app.workspace.getActiveFile();
							if (activeFile && leaf.view.file === activeFile && this.activeNoteOverride !== null) {
								dir = this.activeNoteOverride;
							}
							this.applyDirectionToElement(editorCMContent, dir, `editor-${leaf.id}`);
							this.manageObserver(this.editorMutationObserver, editorCMContent, dir === 'auto' && this.settings.enableAdvancedTextDetection, this.observedEditorElements, `editor-${leaf.id}`);
						}
					} else if (leaf.view.getViewType() === 'canvas') {
						const canvasViewContainer = leaf.view.containerEl;
						const canvasNodesElement = canvasViewContainer.querySelector('.canvas-nodes') as HTMLElement | null; // Target for new cards
						if (canvasNodesElement) {
							currentCanvasViewContentElements.add(canvasNodesElement);
							// Observe .canvas-nodes for child changes (new cards)
							// The direction setting for the observer itself is less critical than for individual cards.
							// We observe if canvasCard setting is 'auto' OR just always observe if canvasObserver exists.
							// Let's observe if canvasCard setting might lead to 'auto' cards.
							this.manageObserver(this.canvasObserver, canvasNodesElement, true, this.observedCanvasContainers, `canvas-nodes-${leaf.id}`);
						}
						const cards = canvasViewContainer.querySelectorAll('.canvas-card');
						cards.forEach((card, index) => {
							const cardContent = card.querySelector('.canvas-card-content') || card.querySelector('.canvas-card-text') || card;
							if (cardContent) this.applyDirectionToElement(cardContent as HTMLElement, this.settings.canvasCard.direction, `canvas-card-${leaf.id}-${index}`);
						});
					}
				} catch (e) {
					console.error(`Error processing leaf ${leaf.id} in applyAllUiSettings:`, e);
				}
			});

			this.cleanupOldObservers(this.editorMutationObserver, this.observedEditorElements, currentEditorCMContentElements);
			this.cleanupOldObservers(this.canvasObserver, this.observedCanvasContainers, currentCanvasViewContentElements);

			// Other UI elements
			this.applyDirectionToElement(this.app.workspace.leftSplit.containerEl, this.settings.leftSidebar.direction, 'left-sidebar');
			this.applyDirectionToElement(this.app.workspace.rightSplit.containerEl, this.settings.rightSidebar.direction, 'right-sidebar');
			this.app.workspace.iterateAllLeaves(leaf => {
				try {
					const viewType = leaf.view.getViewType();
					let targetElement: HTMLElement | null = leaf.view.containerEl; // Default to whole container
					switch (viewType) {
						case 'file-explorer':
							targetElement = leaf.view.containerEl.querySelector('.nav-files-container') as HTMLElement | null || targetElement;
							this.applyDirectionToElement(targetElement, this.settings.fileExplorer.direction, 'file-explorer');
							break;
						case 'search':
							targetElement = leaf.view.containerEl.querySelector('.search-results-container') as HTMLElement | null || targetElement;
							this.applyDirectionToElement(targetElement, this.settings.searchResults.direction, 'search-results');
							break;
						case 'tag':
							targetElement = leaf.view.containerEl.querySelector('.tag-pane-tags') as HTMLElement | null ||
											leaf.view.containerEl.querySelector('.view-content') as HTMLElement | null ||
											targetElement;
							this.applyDirectionToElement(targetElement, this.settings.tagPane.direction, 'tag-pane');
							break;
					}
				} catch (e) {
					console.error(`Error processing non-editor/canvas leaf ${leaf.id} for other UI parts:`, e);
				}
			});
		} catch (error) {
			console.error("Fatal error in applyAllUiSettings:", error);
		}
		if (this.settings.enableAdvancedTextDetection) console.log("Advanced text detection enabled.");
		console.log("Finished applying UI settings.");
	}

	manageObserver(observer: MutationObserver | null, element: HTMLElement | null, shouldObserve: boolean, observedSet: Set<Element>, logName: string) {
		if (!observer || !element) return;
		try {
			if (shouldObserve) {
				if (!observedSet.has(element)) {
					observer.observe(element, { childList: true, subtree: true, characterData: true });
					observedSet.add(element);
					if (logName.startsWith('editor-') && element.classList.contains('cm-content')) { // Ensure it's cm-content for editors
						this.handleEditorMutationInner([{ target: element } as unknown as MutationRecord], observer);
					}
				}
			} else {
				// If it shouldn't be observed but is in the set, it will be removed by cleanupOldObservers.
				// No direct unobserve for single element from shared observer.
			}
		} catch (e) {
			console.error(`Error managing observer for ${logName}:`, e);
		}
	}

	cleanupOldObservers(observer: MutationObserver | null, observedSet: Set<Element>, currentElementsToObserve: Set<Element>) {
		if (!observer) return;
		try {
			const newObservedSet = new Set<Element>();
			observedSet.forEach(el => {
				if (document.body.contains(el) && currentElementsToObserve.has(el)) { // Check if still in DOM and in current set
					newObservedSet.add(el);
				}
			});

			if (newObservedSet.size === 0 && observedSet.size > 0) {
				observer.disconnect();
			}
			observedSet.clear();
			newObservedSet.forEach(el => observedSet.add(el));
		} catch (e) {
			console.error("Error cleaning up observers:", e);
		}
	}

	applyDirectionToElement(element: HTMLElement | null, direction: DirectionSetting, containerName?: string) {
		if (!element) {
			if (containerName) console.warn(`Element not found for ${containerName}`);
			return;
		}
		if (!document.body.contains(element)) {
			// console.warn(`Element for ${containerName} is not in DOM, skipping application.`);
			return;
		}

		try {
			element.dataset.direction = direction;
			element.classList.remove('ltr-mode', 'rtl-mode', 'auto-mode', 'auto-detect-direction');
			element.removeAttribute('data-effective-direction');

			let effectiveDirection = direction;

			if (direction === 'auto') {
				element.classList.add('auto-detect-direction');
				if (this.settings.enableAdvancedTextDetection) {
					const textContent = element.textContent || "";
					const detectedDir = getBlockDirection(textContent);
					effectiveDirection = detectedDir;
					element.dataset.effectiveDirection = detectedDir;
				} else {
					effectiveDirection = this.settings.globalDefaultDirection === 'auto' ? 'ltr' : this.settings.globalDefaultDirection;
					element.dataset.effectiveDirection = effectiveDirection;
				}
			} else {
				element.dataset.effectiveDirection = direction;
			}
			element.classList.add(`${effectiveDirection}-mode`);
		} catch (e) {
			console.error(`Error applying direction to ${containerName || 'element'}:`, e);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyAllUiSettings();
	}
}

class IntelligentRtlSettingTab extends PluginSettingTab {
	plugin: IntelligentRtlPlugin;

	constructor(app: App, plugin: IntelligentRtlPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Intelligent RTL Management Settings'});

		new Setting(containerEl)
			.setName('Global Default Direction')
			.setDesc("Default text direction for elements set to 'Auto' or when no specific rule applies.")
			.addDropdown(dropdown => dropdown
				.addOption('ltr', 'LTR (Left-to-Right)')
				.addOption('rtl', 'RTL (Right-to-Left)')
				.addOption('auto', 'Auto (based on content or specific rules)')
				.setValue(this.plugin.settings.globalDefaultDirection)
				.onChange(async (value: DirectionSetting) => {
					this.plugin.settings.globalDefaultDirection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Advanced Text Detection')
			.setDesc("When 'Auto' is selected for a container, attempt to detect text direction from its content.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAdvancedTextDetection)
				.onChange(async (value) => {
					this.plugin.settings.enableAdvancedTextDetection = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', {text: 'Per-Container Direction Settings'});
		const uiContainers: (keyof Omit<IntelligentRtlSettings, 'globalDefaultDirection' | 'enableAdvancedTextDetection' | 'mySetting'>)[] = [
			'editor', 'leftSidebar', 'rightSidebar', 'fileExplorer', 'searchResults', 'tagPane', 'canvasCard'
		];

		uiContainers.forEach(containerKey => {
			new Setting(containerEl)
				.setName(this.toTitleCase(containerKey))
				.setDesc(`Set text direction for the ${this.toTitleCase(containerKey)}. 'Auto' uses global default or text detection.`)
				.addDropdown(dropdown => dropdown
					.addOption('ltr', 'LTR')
					.addOption('rtl', 'RTL')
					.addOption('auto', 'Auto')
					.setValue(this.plugin.settings[containerKey].direction)
					.onChange(async (value: DirectionSetting) => {
						this.plugin.settings[containerKey].direction = value;
						await this.plugin.saveSettings();
					}));
		});

		new Setting(containerEl)
			.setName('My Setting (Sample)')
			.setDesc('This is a sample setting field, retained for reference.')
			.addText(text => text
				.setPlaceholder('Enter some text')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}

	toTitleCase(str: string): string {
		const result = str.replace(/([A-Z])/g, " $1");
		return result.charAt(0).toUpperCase() + result.slice(1);
	}
}

// Assuming getBlockDirection is globally available for now (e.g. from rtl-text-detector.js)
// If not, it needs to be defined or imported here.
// Example placeholder if rtl-text-detector.js isn't loaded:
if (typeof getBlockDirection === 'undefined') {
	console.warn("getBlockDirection not defined, using placeholder. Text detection will not work correctly.");
	function getBlockDirection(text: string): 'rtl' | 'ltr' { return 'ltr'; }
}
// Remove SampleModal if not used
class SampleModal extends Modal {
	constructor(app: App) { super(app); }
	onOpen() { this.contentEl.setText('Woah!'); }
	onClose() { this.contentEl.empty(); }
}
