/**
 * UI/Components/AutoCombat/AutoCombat.js
 *
 * Full-featured AutoHunt & AutoSkills system:
 * - 470x308 Panels using official GRF assets and textures
 * - Attack Skills (Page 1 & 2) and Buff Skills (Page 3)
 * - HTML5 Drag & Drop from SkillList window directly onto slots
 * - Hotkey (F1-F9) and direct skill casting with range, SP, cooldown and delay handling
 * - Configurable skill intervals for attack and support rotations
 * - Safe Potion dropdowns with ITID persistence and strict HP vs SP vs Hybrid separation
 * - Selectable map monsters and independent automation toggles
 * - Auto Buff Items based on active status timers and Looting
 */

import Client from 'Core/Client.js';
import Preferences from 'Core/Preferences.js';
import DB from 'DB/DBManager.js';
import ItemType from 'DB/Items/ItemType.js';
import Session from 'Engine/SessionStorage.js';
import Network from 'Network/NetworkManager.js';
import PACKETVER from 'Network/PacketVerManager.js';
import PACKET from 'Network/PacketStructure.js';
import Entity from 'Renderer/Entity/Entity.js';
import EntityManager from 'Renderer/EntityManager.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import ChatBox from 'UI/Components/ChatBox/ChatBox.js';
import Inventory from 'UI/Components/Inventory/Inventory.js';
import ShortCut from 'UI/Components/ShortCut/ShortCut.js';
import SkillWindow from 'UI/Components/SkillList/SkillList.js';
import SkillInfo from 'DB/Skills/SkillInfo.js';
import StatusIcons from 'UI/Components/StatusIcons/StatusIcons.js';
import SkillTargetSelection from 'UI/Components/SkillTargetSelection/SkillTargetSelection.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './AutoCombat.html?raw';
import cssText from './AutoCombat.css?raw';
import ItemTable from '../../../DB/Items/ItemTable.js';

const component = new GUIComponent('AutoCombat', cssText);
component.render = () => htmlText;

const defaults = {
	enabled: false,
	attack: true,
	autoSkill: true,
	autoPotion: true,
	autoBuffItem: true,
	loot: true,

	monsters: [],      // array of string mob IDs

	// 3 Pages of Skills (8 slots each)
	skillsPage1: Array.from({ length: 8 }, () => ({
		type: 'none',
		key: 0,
		skillId: 0,
		level: 1,
		interval: 5
	})),
	skillsPage2: Array.from({ length: 8 }, () => ({
		type: 'none',
		key: 0,
		skillId: 0,
		level: 1,
		interval: 5
	})),
	skillsBuff: Array.from({ length: 8 }, () => ({
		type: 'none',
		key: 0,
		skillId: 0,
		level: 1,
		interval: 60
	})),
	skillTimerModeVersion: 0,

	// Potions (stored by ITID!)
	hpItem1: 0,
	hpPercent1: 70,
	hpItem2: 0,
	hpPercent2: 35,
	spItem1: 0,
	spPercent1: 40,
	spItem2: 0,
	spPercent2: 15,
	returnItemId: 0,

	// 8 Buff Items (stored by ITID)
	buffItems: Array.from({ length: 8 }, () => ({ itemId: 0, interval: 60, autoDuration: false })),

	// Low SP normal attack
	lowSpNormalAttack: false,
	lowSpPercent: 15,

	// Looting & Weight
	maxWeightPercent: 85,
	returnOnWeight: false,
	lootEquip: false,
	lootCards: false,
	lootEtc: true,
	lootFilterVersion: 0,

	skillInterval: 250,
	x: 120,
	y: 120,
	show: false
};

const preferences = Preferences.get('AutoCombat', defaults, 1.0);

// Hybrid Items (HP + SP)
const HYBRID_ITEM_IDS = new Set([518, 526, 607, 608, 574, 12028]);
// Pure SP Items
const PURE_SP_IDS = new Set([505, 510, 514, 536, 578]);
const LOOT_EQUIPMENT_TYPES = new Set([
	ItemType.WEAPON,
	ItemType.ARMOR,
	ItemType.SHADOWGEAR,
	ItemType.PETARMOR,
	ItemType.AMMO
]);
const LOOT_CARD_ID_RANGES = [
	[4000, 4999],
	[400000, 499999]
];
// Classic equipment rows can have no type and ClassNum 0, so use their item-ID ranges too.
const LOOT_EQUIPMENT_ID_RANGES = [
	[1100, 1999],
	[2100, 2999],
	[13000, 13499],
	[18100, 18499],
	[20000, 21999]
];
const LOOT_CARD_NAME_PATTERN =
	/(?:^|[\s_])(?:card|cards|carte|cartes|karte|karten)$|^(?:carta|carte|karte)(?:[\s_]|$)|_card(?:_|$)/i;
const LOOT_NON_EQUIPMENT_TYPES = new Set([
	ItemType.HEALING,
	ItemType.USABLE,
	ItemType.ETC,
	ItemType.PETEGG,
	ItemType.DELAYCONSUME,
	ItemType.CASH
]);
const LOOT_EQUIPMENT_NAME_PATTERN =
	/\b(?:sword|dagger|knife|bow|axe|mace|spear|staff|rod|whip|katar|gun|rifle|shotgun|grenade|shuriken|knuckle|claw|instrument|book|armor|armour|shield|helmet|helm|hat|cap|shoes|shoe|boots|sandal|slipper|cloak|garment|robe|coat|shirt|mail|plate|suit|uniform|glove|ring|necklace|earring|bracelet|accessory|manteau|muffler|ribbon|sakkat|circlet|crown|tiara|band|mask|hood|leggings|mantle|pauldron|brooch|clip|rosary|belt|pendant|amulet|buckle|medal|badge|scarf|wings|veil|spada|pugnale|arco|ascia|mazza|lancia|bastone|scudo|elmo|cappello|scarpe|stivali|mantello|veste|armatura|anello|collana|orecchini|guanti)\b/;
const STATUS_KEYWORD_GROUPS = [
	['str', 'strength', 'forza'],
	['agi', 'agility', 'agilita'],
	['vit', 'vitality', 'vitalita'],
	['int', 'intelligence', 'intelligenza'],
	['dex', 'dexterity', 'destrezza'],
	['luk', 'luck', 'fortuna'],
	['aspd', 'attack speed', 'velocita'],
	['atk', 'attack', 'attacco'],
	['matk', 'magic attack', 'attacco magico'],
	['def', 'defense', 'defence', 'difesa'],
	['mdef', 'magic defense', 'magic defence'],
	['flee', 'evasion', 'evasione'],
	['hit', 'accuracy', 'precisione'],
	['critical', 'critico', 'crit']
];
const STATUS_STOP_WORDS = new Set([
	'and', 'the', 'for', 'with', 'you', 'your', 'from', 'this', 'that', 'item', 'potion', 'scroll',
	'increase', 'increases', 'increased', 'boost', 'boosts', 'raise', 'raises', 'enhance', 'enhances',
	'minute', 'minutes', 'second', 'seconds', 'min', 'sec', 'per', 'della', 'delle', 'dell', 'una',
	'un', 'che', 'aumenta', 'aumentare', 'incrementa', 'migliora'
]);

let timer = null;
let currentSkillPage = 1;
let currentTab = 'default';

let lastAction = 0;
let lastAttackAction = 0;
let lastSkillAction = 0;
let lastWander = 0;
let targetGID = 0;

const buffItemLastUsed = new Map();
const skillSlotLastUsed = new Map();
const buffItemDurationCache = new Map();
const observedBuffItemDurations = new Map();
const pendingBuffItemEffects = new Map();
const lastInventoryCounts = new Map();
const unavailableSkillSlots = new Map();
let previousStatusTimers = new Map();
let pendingSkillAttempt = null;
let skillFailureRecovery = false;
const SKILL_FAILURE_SKIP_MS = 30000;
const SKILL_FAILURE_WINDOW_MS = 5000;
const SKILL_FAILURE_HOOK_MARKER = '__autoCombatSkillFailureHook';

const unreachableTargets = new Map();
let trackedTargetGID = 0;
let trackedPlayerPosition = null;
let targetStuckSince = 0;
const TARGET_STUCK_TIMEOUT = 2500;
const UNREACHABLE_TARGET_COOLDOWN = 6000;

let pendingPickupGID = 0;
let pendingPickupAt = 0;
const PICKUP_CONFIRM_TIMEOUT = 900;
const ignoredPickupGIDs = new Set();
const pickupFailures = new Map();
const MAX_PICKUP_ATTEMPTS = 2;
let lastReturnAttemptAt = 0;
const groundItemIdCache = new Map();

// -------------------------------------------------------------
// HELPER: GRF ASSETS
// -------------------------------------------------------------
function setGrfBackground(el, relativePath) {
	if (!el || !relativePath) return;
	// Ensure the element has a fixed size and doesn't expand beyond its parent
	el.style.backgroundSize = 'cover';
	el.style.backgroundPosition = 'center';
	el.style.backgroundRepeat = 'no-repeat';
	Client.loadFile(`${DB.INTERFACE_PATH}${relativePath}`, url => {
		el.style.backgroundImage = `url(${url})`;
	});
}

function getSkillInventorySignature() {
	return (Inventory.getUI()?.list || [])
		.map(item => `${Number(item?.ITID) || 0}:${Number(item?.count) || 0}`)
		.filter(item => !item.startsWith('0:'))
		.sort()
		.join('|');
}

function onAutoSkillFailure() {
	const attempt = pendingSkillAttempt;
	pendingSkillAttempt = null;
	if (!attempt || Date.now() - attempt.at > SKILL_FAILURE_WINDOW_MS) return;

	skillFailureRecovery = true;
	unavailableSkillSlots.set(attempt.slotKey, {
		skillId: attempt.skillId,
		inventorySignature: getSkillInventorySignature(),
		expiresAt: Date.now() + SKILL_FAILURE_SKIP_MS
	});
}

function installSkillFailureMonitor() {
	const originalAddText = ChatBox.addText;
	if (typeof originalAddText !== 'function') {
		throw new Error('AutoCombat cannot monitor skill failures: ChatBox.addText is unavailable.');
	}
	if (originalAddText[SKILL_FAILURE_HOOK_MARKER]) return;

	const monitoredAddText = function monitoredAddText(text, colorType, filterType, color, override) {
		if (filterType === ChatBox.FILTER.SKILL_FAIL) onAutoSkillFailure();
		return originalAddText.call(this, text, colorType, filterType, color, override);
	};
	monitoredAddText[SKILL_FAILURE_HOOK_MARKER] = true;
	ChatBox.addText = monitoredAddText;
}

// -------------------------------------------------------------
// COMPONENT INITIALIZATION
// -------------------------------------------------------------
component.init = function init() {
	const root = this.getRoot();
	installSkillFailureMonitor();

	// Window Controls
	root.querySelector('.autocombat-close').addEventListener('click', () => close());
	this.draggable('.autocombat-titlebar');

	// Tab switching
	root.querySelectorAll('.ah-tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			root.querySelectorAll('.ah-tab-btn').forEach(b => b.classList.remove('active'));
			root.querySelectorAll('.ah-panel').forEach(p => p.classList.remove('active'));
			btn.classList.add('active');
			const tabName = btn.getAttribute('data-tab');
			currentTab = tabName;
			const targetPanel = root.querySelector(`#ah-panel-${tabName}`);
			if (targetPanel) targetPanel.classList.add('active');

			if (tabName === 'monster') refreshMonsters(root);
			if (tabName === 'potion') refreshItems(root);
			if (tabName === 'skill') renderSkillSlots(root);
			if (tabName === 'item') renderItemBuffSlots(root);
		});
	});

	// Subpage buttons inside Skills panel
	root.querySelectorAll('.ah-subpage-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			root.querySelectorAll('.ah-subpage-btn').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			currentSkillPage = Number(btn.getAttribute('data-page')) || 1;

			const panelSkill = root.querySelector('#ah-panel-skill');
			const bgPath = currentSkillPage === 3
				? 'autohunt/setting_skill/bg_skill_buff_autohunt.bmp'
				: (currentSkillPage === 2
					? 'autohunt/setting_skill/bg_skill_attack2_autohunt.bmp'
					: 'autohunt/setting_skill/bg_skill_autohunt.bmp');
			setGrfBackground(panelSkill, bgPath);

			renderSkillSlots(root);
		});
	});

	// General combat controls monster targeting; its sub-options and other features stay independent.
	if (preferences.lootFilterVersion < 1) {
		if (preferences.lootEquip && preferences.lootCards && preferences.lootEtc) {
			preferences.lootEquip = false;
			preferences.lootCards = false;
			preferences.lootEtc = true;
		}
		preferences.lootFilterVersion = 1;
		preferences.save();
	}
	if (preferences.skillTimerModeVersion < 3) {
		['skillsPage1', 'skillsPage2', 'skillsBuff'].forEach(key => {
			if (Array.isArray(preferences[key])) {
				preferences[key] = preferences[key].map(slot => {
					const migrated = { ...(slot || {}) };
					const defaultInterval = key === 'skillsBuff' ? 60 : 5;
					const interval = Number(migrated.interval);
					if (migrated.autoCooldown === true || !Number.isFinite(interval) || interval < 1) {
						migrated.interval = defaultInterval;
					} else {
						migrated.interval = Math.min(3600, Math.max(1, Math.round(interval)));
					}
					delete migrated.autoCooldown;
					return migrated;
				});
			}
		});
		preferences.skillTimerModeVersion = 3;
		preferences.save();
	}

	setupCheckbox(root, '.opt-master', 'enabled');
	setupCheckbox(root, '.opt-attack', 'attack');
	setupCheckbox(root, '.opt-skill', 'autoSkill');
	setupCheckbox(root, '.opt-potion', 'autoPotion');
	setupCheckbox(root, '.opt-buff-item', 'autoBuffItem');
	setupCheckbox(root, '.opt-loot', 'loot');
	setupCheckbox(root, '.opt-lowsp-normal', 'lowSpNormalAttack');
	setupCheckbox(root, '.opt-return-weight', 'returnOnWeight');
	setupCheckbox(root, '.opt-loot-equip', 'lootEquip');
	setupCheckbox(root, '.opt-loot-cards', 'lootCards');
	setupCheckbox(root, '.opt-loot-etc', 'lootEtc');

	// Sliders
	setupSlider(root, '.ah-range-lowsp', '.ah-val-lowsp', 'lowSpPercent');
	setupSlider(root, '.ah-range-hp1', '.ah-val-hp1', 'hpPercent1');
	setupSlider(root, '.ah-range-hp2', '.ah-val-hp2', 'hpPercent2');
	setupSlider(root, '.ah-range-sp1', '.ah-val-sp1', 'spPercent1');
	setupSlider(root, '.ah-range-sp2', '.ah-val-sp2', 'spPercent2');
	setupSlider(root, '.ah-range-maxweight', '.ah-val-maxweight', 'maxWeightPercent');

	root.querySelector('.ah-btn-select-all')?.addEventListener('click', () => toggleAllMonsters(root));

	// Potions selection bindings — save on change
	[
		['hpItem1', '.opt-hp-item-1'],
		['hpItem2', '.opt-hp-item-2'],
		['spItem1', '.opt-sp-item-1'],
		['spItem2', '.opt-sp-item-2']
	].forEach(([key, selector]) => {
		const sel = root.querySelector(selector);
		if (sel) {
			sel.addEventListener('change', e => {
				preferences[key] = Number(e.target.value) || 0;
				preferences.save();
				updatePotionIcon(root, key);
			});
		}
	});

	// Setup potion slot drag-drop for all 4 slots
	setupPotionSlotDrop(root, '.opt-hp-item-1', 'hpItem1');
	setupPotionSlotDrop(root, '.opt-hp-item-2', 'hpItem2');
	setupPotionSlotDrop(root, '.opt-sp-item-1', 'spItem1');
	setupPotionSlotDrop(root, '.opt-sp-item-2', 'spItem2');
	setupReturnItemDrop(root);
	setupBuffItemSlotDrop(root);

	renderSkillSlots(root);
	renderItemBuffSlots(root);
};

component.onAppend = function onAppend() {
	const root = this.getRoot();
	this._host.style.left = `${preferences.x}px`;
	this._host.style.top = `${preferences.y}px`;
	this._host.style.display = preferences.show ? '' : 'none';

	// Apply GRF Backgrounds on panels
	setGrfBackground(root.querySelector('#ah-panel-default'), 'autohunt/setting_default/bg_default_autohunt.bmp');
	setGrfBackground(root.querySelector('#ah-panel-monster'), 'autohunt/setting_monster/bg_monster_autohunt.bmp');
	setGrfBackground(root.querySelector('#ah-panel-skill'), 'autohunt/setting_skill/bg_skill_autohunt.bmp');
	setGrfBackground(root.querySelector('#ah-panel-potion'), 'autohunt/setting_potion/bg_potion1_autohunt.bmp');
	setGrfBackground(root.querySelector('#ah-panel-looting'), 'autohunt/setting_looting/bg_looting_autohunt.bmp');
	setGrfBackground(root.querySelector('#ah-panel-item'), 'autohunt/setting_item/bg_item_autohunt.bmp');

	addIcon();
	refreshMonsters(root);
	refreshItems(root);
	start();
};

function setupCheckbox(root, selector, prefKey, onChange) {
	const el = root.querySelector(selector);
	if (!el) return;

	const updateView = () => {
		const checked = !!preferences[prefKey];
		const iconPath = checked ? 'autohunt/checkbox_on_autohunt.bmp' : 'autohunt/checkbox_off_autohunt.bmp';
		setGrfBackground(el, iconPath);
	};
	updateView();

	el.parentElement.addEventListener('click', e => {
		e.preventDefault();
		preferences[prefKey] = !preferences[prefKey];
		preferences.save();
		updateView();
		if (onChange) onChange(preferences[prefKey]);
	});
}

function setupSlider(root, inputSelector, outputSelector, prefKey) {
	const input = root.querySelector(inputSelector);
	const output = root.querySelector(outputSelector);
	if (!input) return;

	input.value = preferences[prefKey];
	if (output) output.textContent = preferences[prefKey];

	input.addEventListener('input', () => {
		if (output) output.textContent = input.value;
		preferences[prefKey] = Number(input.value);
		preferences.save();
	});
}

// -------------------------------------------------------------
// SKILL SLOTS RENDERING (3 Pages) & DRAG & DROP
// -------------------------------------------------------------
function getSkillPageKey() {
	if (currentSkillPage === 3) return 'skillsBuff';
	if (currentSkillPage === 2) return 'skillsPage2';
	return 'skillsPage1';
}

function renderSkillSlots(root) {
	const container = root.querySelector('#ah-skill-slots-grid');
	if (!container) return;
	container.innerHTML = '';
	const skillWarning = root.querySelector('.ah-skill-warning');
	if (skillWarning) skillWarning.hidden = currentSkillPage !== 3;

	const prefKey = getSkillPageKey();
	let preferencesUpdated = false;
	preferences[prefKey] = Array.from({ length: 8 }, (_, index) => {
		const previous = preferences[prefKey]?.[index] || {};
		const defaultInterval = prefKey === 'skillsBuff' ? 60 : 5;
		const configuredInterval = Number(previous.interval);
		const interval = Math.min(
			3600,
			Math.max(
				1,
				Math.round(
					Number.isFinite(configuredInterval) && configuredInterval > 0 ? configuredInterval : defaultInterval
				)
			)
		);
		if (previous.interval !== interval || Object.hasOwn(previous, 'autoCooldown')) preferencesUpdated = true;
		const normalized = { type: 'none', key: 0, skillId: 0, level: 1, ...previous, interval };
		delete normalized.autoCooldown;
		return normalized;
	});
	if (preferencesUpdated) preferences.save();
	const list = preferences[prefKey];

	for (let i = 0; i < 8; i++) {
		const slot = list[i] || { type: 'none', key: 0, skillId: 0, level: 1 };
		const box = document.createElement('div');
		box.className = 'ah-slot-box';

		const priorityNum = (currentSkillPage - 1) * 8 + (i + 1);
		const skillName = slot.skillId && SkillInfo[slot.skillId] ? SkillInfo[slot.skillId].SkillName : `Skill #${slot.skillId}`;

		box.innerHTML = `
			<div class="ah-slot-header">
				<span>Slot ${i + 1}</span>
				<span style="color:#7ab7ff;">#${priorityNum}</span>
			</div>
			<div class="ah-slot-icon-bg">
				<div class="ah-slot-icon-img"></div>
				<span class="ah-slot-lvl" style="display:none;"></span>
			</div>
			<select class="ah-slot-select sel-mode">
				<option value="none">Disattivato</option>
				<optgroup label="Hotkey Rapido">
					${Array.from({ length: 9 }, (_, k) => `<option value="shortcut_${k}">Hotkey F${k + 1}</option>`).join('')}
				</optgroup>
				${slot.type === 'skill' && slot.skillId ? `<option value="skill" selected>${skillName} (Lv ${slot.level || 1})</option>` : ''}
			</select>
			<div class="ah-buff-timing ah-skill-timing">
				<span>Intervallo</span>
				<input type="number" class="ah-buff-sec ah-skill-interval" min="1" max="3600" value="${slot.interval}">
				<span>secondi</span>
			</div>
		`;

		const iconBg = box.querySelector('.ah-slot-icon-bg');
		const iconImg = box.querySelector('.ah-slot-icon-img');
		const lvlBadge = box.querySelector('.ah-slot-lvl');
		const modeSel = box.querySelector('.sel-mode');
		const intervalInput = box.querySelector('.ah-skill-interval');

		setGrfBackground(iconBg, 'autohunt/skillslot_autohunt.bmp');

		// Initial select value
		if (slot.type === 'shortcut') {
			modeSel.value = `shortcut_${slot.key || 0}`;
		} else if (slot.type === 'skill' && slot.skillId) {
			modeSel.value = 'skill';
		} else {
			modeSel.value = 'none';
		}

		// Update slot icon & badge
		updateSlotDisplay(iconImg, lvlBadge, slot);

		// Dropdown change handler
		modeSel.addEventListener('change', e => {
			const val = e.target.value;
			if (val === 'none') {
				preferences[prefKey][i] = { ...preferences[prefKey][i], type: 'none', key: 0, skillId: 0, level: 1 };
			} else if (val.startsWith('shortcut_')) {
				const scKey = Number(val.replace('shortcut_', '')) || 0;
				preferences[prefKey][i] = { ...preferences[prefKey][i], type: 'shortcut', key: scKey, skillId: 0, level: 1 };
			}
			preferences.save();
			renderSkillSlots(root);
		});

		intervalInput.addEventListener('change', () => {
			const interval = Math.min(3600, Math.max(1, Math.round(Number(intervalInput.value) || 1)));
			intervalInput.value = String(interval);
			preferences[prefKey][i].interval = interval;
			preferences.save();
		});

		// Right click on slot clears it
		box.addEventListener('contextmenu', e => {
			e.preventDefault();
			preferences[prefKey][i] = { ...preferences[prefKey][i], type: 'none', key: 0, skillId: 0, level: 1 };
			preferences.save();
			renderSkillSlots(root);
		});

		// HTML5 Drag & Drop handlers
		box.addEventListener('dragover', e => {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			box.classList.add('drag-hover');
		});

		box.addEventListener('dragleave', () => {
			box.classList.remove('drag-hover');
		});

		box.addEventListener('drop', e => {
			e.preventDefault();
			e.stopPropagation();
			box.classList.remove('drag-hover');

			let dragData = null;
			try {
				dragData = JSON.parse(e.dataTransfer.getData('Text'));
			} catch (_err) {
				dragData = window._OBJ_DRAG_;
			}
			if (!dragData && window._OBJ_DRAG_) dragData = window._OBJ_DRAG_;

			if (dragData) {
				const isSkill = dragData.type === 'skill' || dragData.isSkill;
				const skObj = dragData.data || dragData;
				const skId = Number(skObj.SKID || skObj.ID || 0);

				if (isSkill && skId > 0) {
					const skLvl = Number(skObj.selectedLevel || skObj.level || skObj.count || 1);
					preferences[prefKey][i] = {
						...preferences[prefKey][i],
						type: 'skill',
						skillId: skId,
						level: skLvl,
						key: 0
					};
					preferences.save();
					renderSkillSlots(root);
				}
			}
		});

		container.appendChild(box);
	}
}

function updateSlotDisplay(iconImg, lvlBadge, slot) {
	if (!iconImg) return;
	let targetSkillId = 0;
	let levelText = '';

	if (slot.type === 'shortcut') {
		const sc = ShortCut._list && ShortCut._list[Number(slot.key)];
		if (sc && sc.isSkill && sc.ID) {
			targetSkillId = sc.ID;
			levelText = `F${(slot.key || 0) + 1}`;
		}
	} else if (slot.type === 'skill' && slot.skillId) {
		targetSkillId = Number(slot.skillId);
		levelText = `Lv ${slot.level || 1}`;
	}

	if (targetSkillId) {
		const file = SkillInfo[targetSkillId]?.Name || targetSkillId;
		Client.loadFile(`${DB.INTERFACE_PATH}item/${file}.bmp`, url => {
			iconImg.style.backgroundImage = `url(${url})`;
		});
		if (lvlBadge) {
			lvlBadge.textContent = levelText;
			lvlBadge.style.display = '';
		}
	} else {
		iconImg.style.backgroundImage = 'none';
		if (lvlBadge) lvlBadge.style.display = 'none';
	}
}

// -------------------------------------------------------------
// ITEM BUFF SLOTS RENDERING (8 Slots) & DRAG & DROP
// -------------------------------------------------------------
function renderItemBuffSlots(root) {
	const container = root.querySelector('#ah-item-slots-grid');
	if (!container) return;
	container.innerHTML = '';
	preferences.buffItems = Array.from({ length: 8 }, (_, index) => ({
		itemId: 0,
		interval: 60,
		autoDuration: false,
		...(Array.isArray(preferences.buffItems) ? preferences.buffItems[index] : {})
	}));
	const inventoryItems = (Inventory.getUI().list || []).filter(item => item && item.ITID && item.count > 0);
	const inventoryList = inventoryItems.filter(isBuffConsumable);

	for (let i = 0; i < 8; i++) {
		const slot = preferences.buffItems[i];
		const box = document.createElement('div');
		box.className = 'ah-slot-box';
		box.dataset.buffItemSlot = String(i);

		box.innerHTML = `
			<div class="ah-slot-header">
				<span>Buff ${i + 1}</span>
				<span style="color:#7ab7ff;">#${i + 1}</span>
			</div>
			<div class="ah-slot-icon-bg">
				<div class="ah-slot-icon-img"></div>
			</div>
			<select class="ah-slot-select sel-buff-item">
				<option value="0">Disattivato</option>
			</select>
			<div class="ah-buff-timing">
				<span>Ogni</span>
				<input type="number" class="ah-buff-sec" min="5" max="3600" value="${slot.interval || 60}">
				<span>sec</span>
				<label class="ah-buff-auto-label">
					<input type="checkbox" class="ah-buff-auto">
					Auto
				</label>
			</div>
			<div class="ah-buff-duration"></div>
		`;

		const iconBg = box.querySelector('.ah-slot-icon-bg');
		const iconImg = box.querySelector('.ah-slot-icon-img');
		const sel = box.querySelector('.sel-buff-item');
		const inputSec = box.querySelector('.ah-buff-sec');
		const autoDuration = box.querySelector('.ah-buff-auto');
		const durationLabel = box.querySelector('.ah-buff-duration');

		setGrfBackground(iconBg, 'autohunt/itemslot_autohunt.bmp');

		inventoryList.forEach(item => {
			const option = document.createElement('option');
			option.value = String(item.ITID);
			option.textContent = `${DB.getItemName(item)} (${item.count})`;
			sel.appendChild(option);
		});
		if (slot.itemId && !inventoryList.some(item => Number(item.ITID) === Number(slot.itemId))) {
			const selectedItem = inventoryItems.find(item => Number(item.ITID) === Number(slot.itemId));
			const option = document.createElement('option');
			option.value = String(slot.itemId);
			option.textContent = selectedItem
				? `${DB.getItemName(selectedItem)} (${selectedItem.count})`
				: `${DB.getItemInfo(slot.itemId).identifiedDisplayName || `Item #${slot.itemId}`} (non in inventario)`;
			sel.appendChild(option);
		}

		sel.value = slot.itemId || 0;
		autoDuration.checked = !!slot.autoDuration;
		inputSec.disabled = autoDuration.checked;
		updateBuffItemIcon(iconImg, slot.itemId);
		updateBuffDurationLabel(slot, durationLabel);

		sel.addEventListener('change', () => {
			preferences.buffItems[i] = { ...preferences.buffItems[i], itemId: Number(sel.value) || 0 };
			preferences.save();
			updateBuffItemIcon(iconImg, preferences.buffItems[i].itemId);
			updateBuffDurationLabel(preferences.buffItems[i], durationLabel);
		});

		autoDuration.addEventListener('change', () => {
			preferences.buffItems[i] = { ...preferences.buffItems[i], autoDuration: autoDuration.checked };
			inputSec.disabled = autoDuration.checked;
			preferences.save();
			updateBuffDurationLabel(preferences.buffItems[i], durationLabel);
		});

		inputSec.addEventListener('change', () => {
			const interval = Math.min(3600, Math.max(5, Number(inputSec.value) || 60));
			inputSec.value = interval;
			preferences.buffItems[i] = { ...preferences.buffItems[i], interval };
			preferences.save();
		});

		container.appendChild(box);
	}
}

function setupBuffItemSlotDrop(root) {
	const container = root.querySelector('#ah-item-slots-grid');
	if (!container || container.dataset.dropBound) return;
	container.dataset.dropBound = 'true';

	container.addEventListener('dragover', event => {
		const box = event.target.closest('.ah-slot-box[data-buff-item-slot]');
		if (!box) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		box.classList.add('drag-hover');
	});

	container.addEventListener('dragleave', event => {
		const box = event.target.closest('.ah-slot-box[data-buff-item-slot]');
		if (box && !box.contains(event.relatedTarget)) box.classList.remove('drag-hover');
	});

	container.addEventListener('drop', event => {
		const box = event.target.closest('.ah-slot-box[data-buff-item-slot]');
		if (!box) return;
		event.preventDefault();
		event.stopPropagation();
		box.classList.remove('drag-hover');

		const item = getDraggedItem(event);
		const index = Number(box.dataset.buffItemSlot);
		if (!item || !Number.isInteger(index) || !isConsumableItem(item)) return;

		preferences.buffItems[index] = { ...preferences.buffItems[index], itemId: item.ITID };
		preferences.save();
		renderItemBuffSlots(root);
	});
}

function updateBuffItemIcon(iconImg, itemId) {
	if (!iconImg) return;
	if (!itemId) {
		iconImg.style.backgroundImage = 'none';
		return;
	}
	const itemInfo = DB.getItemInfo(itemId);
	const resName = itemInfo.identifiedResourceName || itemId;
	Client.loadFile(`${DB.INTERFACE_PATH}item/${resName}.bmp`, url => {
		iconImg.style.backgroundImage = `url(${url})`;
	});
}

function isConsumableItem(item) {
	const info = DB.getItemInfo(item.ITID);
	const type = Number(item.type ?? info.type);
	if (![ItemType.HEALING, ItemType.USABLE, ItemType.DELAYCONSUME, ItemType.CASH].includes(type)) return false;
	return true;
}

function isBuffConsumable(item) {
	if (!isConsumableItem(item)) return false;
	const info = DB.getItemInfo(item.ITID);
	const name = `${info.identifiedDisplayName || ''} ${info.identifiedResourceName || ''}`;
	const description = `${info.identifiedDescriptionName || ''} ${info.unidentifiedDescriptionName || ''}`;
	return hasBuffEffect(`${name} ${description}`);
}

function hasBuffEffect(text) {
	return /(?:\b(?:increase|increases|increased|boost|boosts|raise|raises|enhance|enhances|awakening|concentration|blessing|attack|defense|defence|aspd|matk|mdef|atk|str|agi|vit|int|dex|luk|critical|flee|hit|drop rate|resistance)\b|aument\w*|increment\w*|potenzi\w*|miglior\w*|attacc\w*|difes\w*|agilit\w*|evasione|precisione|resistenz\w*|forza|destrezza|vitalit\w*|intelligenza|fortuna|velocit\w*)/i.test(
		text
	);
}

function getBuffDurationSeconds(itemId) {
	if (!itemId) return 0;
	if (observedBuffItemDurations.has(Number(itemId))) return observedBuffItemDurations.get(Number(itemId));
	if (buffItemDurationCache.has(itemId)) return buffItemDurationCache.get(itemId);

	const info = DB.getItemInfo(itemId);
	const description = `${info.identifiedDescriptionName || ''} ${info.unidentifiedDescriptionName || ''}`;
	const durationPattern =
		/(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|ore?|ora|minutes?|mins?|minuto|minuti?|min|seconds?|secs?|secondo|secondi?|sec)\b/gi;
	let durationSeconds = 0;
	let match;
	while ((match = durationPattern.exec(description))) {
		const amount = Number(match[1].replace(',', '.'));
		const unit = match[2].toLowerCase();
		if (/^(?:h|hour|hours|hr|hrs|ora|ore)/.test(unit)) durationSeconds += amount * 3600;
		else if (/^(?:min|minute|minutes|mins|minuto|minuti)/.test(unit)) durationSeconds += amount * 60;
		else durationSeconds += amount;
	}

	buffItemDurationCache.set(itemId, durationSeconds);
	return durationSeconds;
}

function getDisplayedStatusTimers() {
	const root = StatusIcons.getRoot();
	const timers = new Map();
	if (!root) return timers;

	root.querySelectorAll('#StatusIcons .state').forEach(state => {
		const description = state.querySelector('.description');
		const time = description?.querySelector('.time');
		if (!description || !time) return;

		const seconds = parseStatusTime(time.textContent);
		if (!seconds) return;
		const label = Array.from(description.children)
			.map(line => line.textContent.replace(time.textContent, '').trim())
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
		if (label) timers.set(label, seconds);
	});

	return timers;
}

function getMatchingItemStatusRemaining(itemId, timers) {
	const info = DB.getItemInfo(itemId);
	const itemText = `${info.identifiedDisplayName || ''} ${info.identifiedResourceName || ''} ${
		info.identifiedDescriptionName || ''
	} ${info.unidentifiedDescriptionName || ''}`
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
	const itemWords = new Set((itemText.match(/[a-z0-9]+/g) || []).filter(word => !STATUS_STOP_WORDS.has(word)));
	if (!itemWords.size) return 0;

	let bestScore = 0;
	let remaining = 0;
	timers.forEach((seconds, label) => {
		const statusText = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		const statusWords = new Set(statusText.match(/[a-z0-9]+/g) || []);
		let score = Array.from(itemWords).filter(word => statusWords.has(word)).length;
		STATUS_KEYWORD_GROUPS.forEach(group => {
			if (group.some(word => itemText.includes(word)) && group.some(word => statusText.includes(word))) {
				score++;
			}
		});
		if (score > bestScore) {
			bestScore = score;
			remaining = seconds;
		}
	});

	return remaining;
}

function parseStatusTime(value) {
	const text = String(value || '').trim().toLowerCase();
	const minutes = text.match(/(\d+)\s*(?:minutes?|minuto|minuti?|mins?|min)\b/i);
	const seconds = text.match(/(\d+)\s*(?:seconds?|secondo|secondi?|secs?|sec)\b/i);
	if (minutes || seconds) return (Number(minutes?.[1]) || 0) * 60 + (Number(seconds?.[1]) || 0);

	const numbers = text.match(/\d+/g);
	if (numbers?.length > 1) return Number(numbers[0]) * 60 + Number(numbers[1]);
	return numbers?.length === 1 ? Number(numbers[0]) : 0;
}

function observeActiveBuffDurations() {
	const currentStatusTimers = getDisplayedStatusTimers();
	const itemIds = new Set(
		(Array.isArray(preferences.buffItems) ? preferences.buffItems : [])
			.map(slot => Number(slot?.itemId) || 0)
			.filter(Boolean)
	);
	const currentCounts = new Map(Array.from(itemIds, itemId => [itemId, 0]));
	(Inventory.getUI().list || []).forEach(item => {
		const itemId = Number(item?.ITID) || 0;
		if (currentCounts.has(itemId)) currentCounts.set(itemId, Number(item.count) || 0);
	});

	currentCounts.forEach((count, itemId) => {
		const previousCount = lastInventoryCounts.get(itemId);
		if (previousCount !== undefined && count < previousCount) {
			const startedAt = Date.now();
			buffItemLastUsed.set(itemId, startedAt);
			pendingBuffItemEffects.set(itemId, {
				before: new Map(previousStatusTimers),
				startedAt
			});
		}
	});

	pendingBuffItemEffects.forEach((effect, itemId) => {
		if (Date.now() - effect.startedAt > 15000) {
			pendingBuffItemEffects.delete(itemId);
			return;
		}

		const refreshed = Array.from(currentStatusTimers, ([label, seconds]) => ({
			label,
			seconds,
			previous: effect.before.get(label) || 0
		})).filter(status => status.seconds > status.previous);
		const elapsed = Math.max(0, (Date.now() - effect.startedAt) / 1000);
		const duration = refreshed.length
			? Math.ceil(Math.max(...refreshed.map(status => status.seconds + elapsed)))
			: Math.ceil(getMatchingItemStatusRemaining(itemId, currentStatusTimers) + elapsed);
		if (!duration) return;

		observedBuffItemDurations.set(itemId, duration);
		buffItemLastUsed.set(itemId, effect.startedAt);
		pendingBuffItemEffects.delete(itemId);
		updateBuffDurationLabels();
	});

	lastInventoryCounts.clear();
	currentCounts.forEach((count, itemId) => lastInventoryCounts.set(itemId, count));
	previousStatusTimers = currentStatusTimers;
}

function updateBuffDurationLabels() {
	const root = component.getRoot();
	root.querySelectorAll('#ah-item-slots-grid .ah-slot-box').forEach((box, index) => {
		updateBuffDurationLabel(preferences.buffItems[index], box.querySelector('.ah-buff-duration'));
	});
}

function updateBuffDurationLabel(slot, label) {
	if (!slot || !label) return;
	const durationSeconds = getBuffDurationSeconds(slot.itemId);
	if (slot.autoDuration && durationSeconds) {
		const minutes = Math.floor(durationSeconds / 60);
		const seconds = durationSeconds % 60;
		label.textContent = minutes ? `Auto: ${minutes}m ${seconds ? `${seconds}s` : ''}`.trim() : `Auto: ${seconds}s`;
	} else if (slot.autoDuration) {
		label.textContent = 'Durata non rilevata; usa il tempo manuale';
	} else {
		label.textContent = 'Tempo manuale';
	}
}

// -------------------------------------------------------------
// POTION SLOT ICON HELPERS
// -------------------------------------------------------------
function updatePotionIcon(root, prefKey) {
	// Try to find by data-prefkey attribute on the icon img
	const iconImg = root.querySelector(`[data-potion-key="${prefKey}"]`);
	if (!iconImg) return;
	const itid = preferences[prefKey];
	if (!itid) {
		iconImg.style.backgroundImage = 'none';
		return;
	}
	const itemInfo = DB.getItemInfo(itid);
	const resName = itemInfo.identifiedResourceName || itid;
	Client.loadFile(`${DB.INTERFACE_PATH}item/${resName}.bmp`, url => {
		iconImg.style.backgroundImage = `url(${url})`;
	});
}

function setupPotionSlotDrop(root, selectSelector, prefKey) {
	const sel = root.querySelector(selectSelector);
	if (!sel) return;
	const box = sel.closest('.ah-potion-box');
	if (!box) return;

	box.addEventListener('dragover', e => {
		e.preventDefault();
		box.classList.add('drag-hover');
	});
	box.addEventListener('dragleave', () => box.classList.remove('drag-hover'));
	box.addEventListener('drop', e => {
		e.preventDefault();
		e.stopPropagation();
		box.classList.remove('drag-hover');
		const item = getDraggedItem(e);
		if (!item || !isPotionCompatible(item, prefKey)) return;
		preferences[prefKey] = item.ITID;
		preferences.save();
		refreshItems(root);
	});
}

function isPotionCompatible(item, prefKey) {
	const name = getHealingName(item);
	if (isHybridItem(item, name)) return true;
	return prefKey.startsWith('hp') ? isHpOnlyItem(item, name) : isSpOnlyItem(item, name);
}

function getDraggedItem(event) {
	let dragData = null;
	try {
		const text = event.dataTransfer?.getData('text/plain') || event.dataTransfer?.getData('Text');
		if (text) dragData = JSON.parse(text);
	} catch (_error) {
		dragData = null;
	}

	dragData = dragData || window._OBJ_DRAG_;
	if (!dragData || (dragData.type !== 'item' && !dragData.data?.ITID && !dragData.ITID && !dragData.itemId)) return null;
	const dragged = dragData.data || dragData.item || dragData;
	const ITID = Number(dragged.ITID || dragged.itemId || dragged.itemID || dragData.ITID || dragData.itemId || 0);
	if (!ITID) return null;
	return { ...dragged, ITID };
}

function setupReturnItemDrop(root) {
	const dropTarget = root.querySelector('.ah-return-item-drop');
	const iconBg = root.querySelector('.ah-return-item-icon-bg');
	const clearButton = root.querySelector('.ah-return-item-clear');
	if (!dropTarget || !iconBg || !clearButton) return;

	setGrfBackground(iconBg, 'autohunt/itemslot_autohunt.bmp');
	updateReturnItemIcon(root);

	dropTarget.addEventListener('dragover', event => {
		event.preventDefault();
		dropTarget.classList.add('drag-hover');
	});
	dropTarget.addEventListener('dragleave', () => dropTarget.classList.remove('drag-hover'));
	dropTarget.addEventListener('drop', event => {
		event.preventDefault();
		event.stopPropagation();
		dropTarget.classList.remove('drag-hover');
		const item = getDraggedItem(event);
		if (!item || !isButterflyWing(item.ITID)) return;
		preferences.returnItemId = item.ITID;
		preferences.save();
		updateReturnItemIcon(root);
	});

	clearButton.addEventListener('click', () => {
		preferences.returnItemId = 0;
		preferences.save();
		updateReturnItemIcon(root);
	});
}

function isButterflyWing(itemId) {
	if (!itemId) return false;
	const info = DB.getItemInfo(itemId);
	const name = `${info.identifiedDisplayName || ''} ${info.identifiedResourceName || ''}`;
	return /(?:^|[^a-z])butterfly[_\s]*wing(?:$|[^a-z])|(?:^|[^a-z])(?:ala|ali)[_\s]+(?:di[_\s]+)?farfalla(?:$|[^a-z])/i.test(name);
}

function updateReturnItemIcon(root) {
	const icon = root.querySelector('.ah-return-item-icon');
	const name = root.querySelector('.ah-return-item-name');
	const itemId = Number(preferences.returnItemId) || 0;
	if (!icon || !name) return;
	if (!itemId) {
		icon.style.backgroundImage = 'none';
		name.textContent = 'Trascina qui la Farfalla';
		return;
	}

	const info = DB.getItemInfo(itemId);
	name.textContent = info.identifiedDisplayName || `Item #${itemId}`;
	const resourceName = info.identifiedResourceName || itemId;
	Client.loadFile(`${DB.INTERFACE_PATH}item/${resourceName}.bmp`, url => {
		icon.style.backgroundImage = `url(${url})`;
	});
}

function getWeightPercent() {
	const entity = Session.Entity;
	if (!entity) return 0;
	const weight = Number(entity.weight);
	const maxWeight = Number(entity.max_weight);
	if (Number.isFinite(weight) && Number.isFinite(maxWeight) && maxWeight > 0) {
		return (weight / maxWeight) * 100;
	}
	return entity.isOverWeight ? 100 : 0;
}

function handleWeightReturn() {
	const limit = Number(preferences.maxWeightPercent) || 85;
	if (getWeightPercent() < limit) return false;
	if (!preferences.returnOnWeight) return true;

	const now = Date.now();
	if (now - lastReturnAttemptAt < 3000) return true;
	const itemId = Number(preferences.returnItemId) || 0;
	if (!itemId) return true;

	const item = (Inventory.getUI().list || []).find(entry => entry && Number(entry.ITID) === itemId && entry.count > 0);
	if (!item) return true;

	lastReturnAttemptAt = now;
	useItemByIndex(item.index);
	return true;
}

function getGroundItemId(entity) {
	const explicitId = Number(
		entity.ITID || entity.itemId || entity.itemID || entity.display?.ITID || entity.display?.itemId || 0
	);
	if (explicitId) return explicitId;

	const normalizeName = name =>
		String(name || '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim()
			.toLowerCase()
			.replace(/\s+/g, ' ');
	const displayName = normalizeName(entity.display?.name);
	if (!displayName) return 0;
	if (groundItemIdCache.has(displayName)) return groundItemIdCache.get(displayName);

	let matchedId = 0;
	let matchedLength = 0;
	Object.keys(ItemTable).forEach(itemId => {
		const item = ItemTable[itemId];
		if (!item) return;
		[item.identifiedDisplayName, item.unidentifiedDisplayName].forEach(name => {
			const normalizedName = normalizeName(name);
			if (normalizedName.length > matchedLength && displayName.includes(normalizedName)) {
				matchedId = Number(itemId);
				matchedLength = normalizedName.length;
			}
		});
	});

	groundItemIdCache.set(displayName, matchedId);
	return matchedId;
}

function getLootCategory(itemId) {
	const info = DB.getItemInfo(itemId) || {};
	const itemType = Number(info.type);
	const itemText = `${info.identifiedDisplayName || ''} ${info.unidentifiedDisplayName || ''} ${
		info.identifiedResourceName || ''
	}`
		.toLowerCase()
		.replace(/[_-]+/g, ' ');
	const itemIdNumber = Number(itemId);
	const isCard =
		itemType === ItemType.CARD ||
		isItemIdInRanges(itemIdNumber, LOOT_CARD_ID_RANGES) ||
		[
			info.identifiedDisplayName || '',
			info.unidentifiedDisplayName || '',
			info.identifiedResourceName || ''
		].some(name => LOOT_CARD_NAME_PATTERN.test(String(name).replace(/[_-]+/g, ' ')));
	if (isCard) return 'cards';

	const hasEquipmentMetadata =
		LOOT_EQUIPMENT_TYPES.has(itemType) ||
		isItemIdInRanges(itemIdNumber, LOOT_EQUIPMENT_ID_RANGES) ||
		Number(info.ClassNum) > 0 ||
		Number(info.slotCount) > 0;
	if (hasEquipmentMetadata) return 'equip';
	if (LOOT_NON_EQUIPMENT_TYPES.has(itemType)) return 'etc';
	if (LOOT_EQUIPMENT_NAME_PATTERN.test(itemText)) return 'equip';

	// Unknown and non-equipment items stay in ETC so they remain independently filterable.
	return 'etc';
}

function isItemIdInRanges(itemId, ranges) {
	return ranges.some(([minimum, maximum]) => itemId >= minimum && itemId <= maximum);
}

function canLootItem(entity) {
	const itemId = getGroundItemId(entity);
	if (!itemId) return false;

	switch (getLootCategory(itemId)) {
		case 'equip':
			return !!preferences.lootEquip;
		case 'cards':
			return !!preferences.lootCards;
		case 'etc':
			return !!preferences.lootEtc;
		default:
			return false;
	}
}

// -------------------------------------------------------------
// MONSTER LIST & SELECTION (uses only DB real IDs)
// -------------------------------------------------------------
function normalizeMonsterId(value) {
	const id = Number(value);
	return Number.isFinite(id) && id > 0 ? id & 0xffff : 0;
}

function getMapMonsterEntries() {
	const mapName = MapRenderer.currentMap || Session.mapState?.mapName || '';
	const entries = new Map();
	DB.getMapMonsterTypes(mapName).forEach(monster => {
		const id = normalizeMonsterId(monster.id);
		if (id) entries.set(String(id), monster.name || DB.getMonsterName(id));
	});
	return entries;
}

function refreshMonsters(root) {
	const monsterMap = getMapMonsterEntries();

	const container = root.querySelector('.ah-monster-list-container');
	const countEl = root.querySelector('.ah-monster-count');
	if (!container) return;
	container.innerHTML = '';

	const storedMonsterIds = Array.isArray(preferences.monsters) ? preferences.monsters : [];
	let selectedSet = new Set(storedMonsterIds.map(id => String(normalizeMonsterId(id))).filter(id => id !== '0'));
	const normalizedMonsterIds = Array.from(selectedSet);
	if (
		normalizedMonsterIds.length !== storedMonsterIds.length ||
		normalizedMonsterIds.some((id, index) => id !== String(storedMonsterIds[index]))
	) {
		preferences.monsters = normalizedMonsterIds;
		preferences.save();
	}
	let count = 0;

	monsterMap.forEach((name, id) => {
		count++;
		const row = document.createElement('div');
		row.className = 'ah-monster-item';
		const isChecked = selectedSet.has(id);
		const displayName = name || DB.getMonsterName(Number(id)) || `Monster ${id}`;

		row.innerHTML = '<span class="ah-custom-checkbox"></span><span class="ah-monster-name"></span>';

		const cb = row.querySelector('.ah-custom-checkbox');
		cb.dataset.id = id;
		const nameLabel = row.querySelector('.ah-monster-name');
		nameLabel.textContent = `${displayName} `;
		const idLabel = document.createElement('small');
		idLabel.style.color = '#7ca9df';
		idLabel.textContent = `(ID: ${id})`;
		nameLabel.appendChild(idLabel);
		setGrfBackground(cb, isChecked ? 'autohunt/checkbox_on_autohunt.bmp' : 'autohunt/checkbox_off_autohunt.bmp');

		row.addEventListener('click', () => {
			if (selectedSet.has(id)) {
				selectedSet.delete(id);
				setGrfBackground(cb, 'autohunt/checkbox_off_autohunt.bmp');
			} else {
				selectedSet.add(id);
				setGrfBackground(cb, 'autohunt/checkbox_on_autohunt.bmp');
			}
			preferences.monsters = Array.from(selectedSet);
			preferences.save();
			targetGID = 0;
		});

		container.appendChild(row);
	});

	if (countEl) countEl.textContent = `${count} tipi di mostri rilevati in mappa`;
}

function toggleAllMonsters(root) {
	const allIds = Array.from(getMapMonsterEntries().keys());
	const selected = new Set((preferences.monsters || []).map(id => String(normalizeMonsterId(id))));
	const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
	preferences.monsters = allSelected ? [] : allIds;
	preferences.save();
	targetGID = 0;
	refreshMonsters(root);
}

// -------------------------------------------------------------
// POTIONS: HP / SP / HYBRID CLASSIFICATION
// -------------------------------------------------------------
function getHealingName(item) {
	return DB.getItemName(item, {
		showItemRefine: false,
		showItemGrade: false,
		showItemSlots: false,
		showItemPrefix: false,
		showItemPostfix: false,
		showItemOptions: false
	}).toLowerCase();
}

function getHealingDescription(item) {
	const info = DB.getItemInfo(item.ITID);
	return `${info.identifiedDescriptionName || ''} ${info.unidentifiedDescriptionName || ''}`.toLowerCase();
}

function isHybridItem(item, name) {
	if (HYBRID_ITEM_IDS.has(Number(item.ITID))) return true;
	if (/\b(royal jelly|honey|yggdrasil|miele|pappa reale|seme di yggdrasil|frutto di yggdrasil)\b/i.test(name)) return true;

	const info = DB.getItemInfo(item.ITID);
	if ((item.type ?? info.type) !== ItemType.HEALING) return false;
	const description = getHealingDescription(item);
	return /(?:\b(?:hp|health)\b.{0,40}\b(?:sp|mana)\b|\b(?:sp|mana)\b.{0,40}\b(?:hp|health)\b)/i.test(description);
}

function isSpOnlyItem(item, name) {
	if (PURE_SP_IDS.has(Number(item.ITID))) return true;
	if (isHybridItem(item, name)) return false;
	if (/\b(sp|mana|blue potion|blue herb|grape|strawberry|pozione blu|erba blu|uva|fragola)\b/i.test(name)) return true;
	if ((item.type ?? DB.getItemInfo(item.ITID).type) !== ItemType.HEALING) return false;
	const description = getHealingDescription(item);
	return /\b(?:sp|mana)\b/i.test(description) && !/\b(?:hp|health)\b/i.test(description);
}

function isHpOnlyItem(item, name) {
	if (isHybridItem(item, name)) return false;
	if (isSpOnlyItem(item, name)) return false;
	if (
		(item.type ?? DB.getItemInfo(item.ITID).type) === ItemType.HEALING ||
		/\b(hp|health potion|healing potion|red|orange|yellow|white|herb|fish|meat|apple|pozione|erba|mela|carne|pesce)\b/i.test(name)
	) return true;
	return false;
}

function refreshItems(root) {
	const inventoryList = (Inventory.getUI().list || []).filter(item => {
		return item && item.ITID && Number(item.count) > 0;
	});

	// Separate HP items vs SP items strictly
	const hpItems = inventoryList.filter(item => {
		const name = getHealingName(item);
		return isHybridItem(item, name) || isHpOnlyItem(item, name);
	});

	const spItems = inventoryList.filter(item => {
		const name = getHealingName(item);
		return isHybridItem(item, name) || isSpOnlyItem(item, name);
	});

	const populateSelect = (selector, prefKey, items) => {
		const sel = root.querySelector(selector);
		if (!sel) return;
		const currentVal = Number(preferences[prefKey]) || 0;
		sel.innerHTML = '<option value="0">Disattivato</option>';
		items.forEach(item => {
			const opt = document.createElement('option');
			opt.value = String(item.ITID);
			opt.textContent = `${DB.getItemName(item)} (${item.count})`;
			if (Number(item.ITID) === currentVal) opt.selected = true;
			sel.appendChild(opt);
		});
		// Se il valore salvato non è nella lista (item non in inventario), mostra comunque il nome
		if (currentVal > 0 && !items.find(it => Number(it.ITID) === currentVal)) {
			const opt = document.createElement('option');
			opt.value = String(currentVal);
			const info = DB.getItemInfo(currentVal);
			opt.textContent = `${info?.identifiedDisplayName || 'Item #' + currentVal} (non in inv.)`;
			opt.selected = true;
			sel.appendChild(opt);
		}
	};

	populateSelect('.opt-hp-item-1', 'hpItem1', hpItems);
	populateSelect('.opt-hp-item-2', 'hpItem2', hpItems);
	populateSelect('.opt-sp-item-1', 'spItem1', spItems);
	populateSelect('.opt-sp-item-2', 'spItem2', spItems);

	// Update potion slot icons
	['hpItem1', 'hpItem2', 'spItem1', 'spItem2'].forEach(key => {
		updatePotionIcon(root, key);
	});

	// Update icon bg for each potion slot
	root.querySelectorAll('.ah-potion-slot-icon-bg').forEach(bg => {
		setGrfBackground(bg, 'autohunt/itemslot_autohunt.bmp');
	});
}

// -------------------------------------------------------------
// CORE COMBAT & SKILL EXECUTION
// -------------------------------------------------------------
function canAct() {
	return Session.Entity && Date.now() - lastAction > 300;
}

function canAttack() {
	return Session.Entity && Date.now() - lastAttackAction > 180;
}

function isPlayerCasting() {
	return Session.Entity && Session.Entity.action === Session.Entity.ACTION.SKILL;
}

function castSkillOnTarget(skillId, level, targetEntity) {
	if (!skillId || !Session.Entity) return false;
	const info = SkillInfo[skillId];
	const skill = SkillWindow.getUI()?.getSkillById?.(skillId);
	if (skill && skill.type === 0) return false;
	const targetType = Number.isInteger(skill?.type)
		? skill.type
		: targetEntity === Session.Entity
			? SkillTargetSelection.TYPE.SELF
			: SkillTargetSelection.TYPE.ENEMY;
	if (Date.now() - lastSkillAction < preferences.skillInterval) {
		return false;
	}

	// SP check
	const spCost = (info?.SpAmount && (info.SpAmount[level - 1] || info.SpAmount[0])) || 0;
	if (Session.Entity.life && Session.Entity.life.sp < spCost) {
		return false;
	}

	// Range check
	const skRange =
		skill?.attackRange || (info?.AttackRange && (info.AttackRange[level - 1] || info.AttackRange[0])) || 2;
	if (
		!(targetType & SkillTargetSelection.TYPE.PLACE) &&
		targetEntity &&
		targetEntity !== Session.Entity &&
		targetEntity.position
	) {
		const dist = Math.hypot(
			targetEntity.position[0] - Session.Entity.position[0],
			targetEntity.position[1] - Session.Entity.position[1]
		);
		if (dist > skRange + 1) {
			moveToTarget(targetEntity);
			return false;
		}
	}

	// Dispatch Packet
	if (targetEntity === Session.Entity) {
		if (
			targetType & SkillTargetSelection.TYPE.PLACE &&
			!(targetType & (SkillTargetSelection.TYPE.SELF | SkillTargetSelection.TYPE.FRIEND))
		) {
			return false;
		}
		const pkt = PACKETVER.value >= 20180307 ? new PACKET.CZ.USE_SKILL2() : new PACKET.CZ.USE_SKILL();
		pkt.SKID = skillId;
		pkt.selectedLevel = level;
		pkt.targetID = Session.Entity.GID;
		Network.sendPacket(pkt);
	} else if (targetType & SkillTargetSelection.TYPE.PLACE) {
		if (
			!targetEntity ||
			targetEntity.objecttype !== Entity.TYPE_MOB ||
			targetEntity.action === targetEntity.ACTION.DIE ||
			targetEntity.life?.hp === 0 ||
			!targetEntity.position ||
			EntityManager.get(targetEntity.GID) !== targetEntity
		) {
			return false;
		}
		SkillTargetSelection.onUseSkillToPos(
			skillId,
			level,
			Math.round(targetEntity.position[0]),
			Math.round(targetEntity.position[1])
		);
	} else if (targetType & SkillTargetSelection.TYPE.SELF && !(targetType & SkillTargetSelection.TYPE.TARGET)) {
		return false;
	} else { // Single target skill on monster
		const pkt = PACKETVER.value >= 20180307 ? new PACKET.CZ.USE_SKILL2() : new PACKET.CZ.USE_SKILL();
		pkt.SKID = skillId;
		pkt.selectedLevel = level;
		pkt.targetID = targetEntity ? targetEntity.GID : Session.Entity.GID;
		Network.sendPacket(pkt);
	}

	lastSkillAction = Date.now();
	lastAction = lastSkillAction;
	return true;
}

function canUseSkillSlot(slot, slotKey) {
	const interval = Math.max(1, Number(slot.interval) || 1);
	const lastUsed = skillSlotLastUsed.get(slotKey) || 0;
	return Date.now() - lastUsed >= interval * 1000;
}

function isSkillSlotUnavailable(slotKey, skillId) {
	const unavailable = unavailableSkillSlots.get(slotKey);
	if (!unavailable) return false;
	if (
		Date.now() >= unavailable.expiresAt ||
		unavailable.inventorySignature !== getSkillInventorySignature() ||
		(skillId && unavailable.skillId !== skillId)
	) {
		unavailableSkillSlots.delete(slotKey);
		return false;
	}
	return true;
}

function getAttackSkillSlotId(slot) {
	if (slot?.type === 'skill') return Number(slot.skillId) || 0;
	if (slot?.type !== 'shortcut') return 0;
	const shortcut = ShortCut._list?.[Number(slot.key)];
	return shortcut?.isSkill ? Number(shortcut.ID) || 0 : 0;
}

function allAttackSkillSlotsUnavailable() {
	const slots = [...preferences.skillsPage1, ...preferences.skillsPage2]
		.map((slot, index) => ({
			slot,
			skillId: getAttackSkillSlotId(slot),
			slotKey: index < 8 ? `skillsPage1:${index}` : `skillsPage2:${index - 8}`
		}))
		.filter(({ skillId }) => skillId > 0);
	return slots.length === 0 || slots.every(({ slotKey, skillId }) => isSkillSlotUnavailable(slotKey, skillId));
}

function useSkillOnTarget(slot, targetEntity, slotKey) {
	if (!slot || slot.type === 'none' || !targetEntity) return false;
	if (!canUseSkillSlot(slot, slotKey)) return false;

	let skillId = 0;
	let level = 1;
	if (slot.type === 'shortcut') {
		const sc = ShortCut._list && ShortCut._list[Number(slot.key)];
		if (!sc || !sc.isSkill || !sc.ID) return false;
		skillId = Number(sc.ID);
		level = Number(sc.count) || 1;
	} else if (slot.type === 'skill' && slot.skillId) {
		skillId = Number(slot.skillId);
		level = Number(slot.level) || 1;
	}

	if (!skillId) return false;
	if (isSkillSlotUnavailable(slotKey, skillId)) return false;
	const lastCast = lastSkillAction;
	const result = castSkillOnTarget(skillId, level, targetEntity);
	if (lastSkillAction !== lastCast) {
		skillSlotLastUsed.set(slotKey, lastSkillAction);
		pendingSkillAttempt = { slotKey, skillId, at: lastSkillAction };
		skillFailureRecovery = false;
	}
	return result;
}

function castBuffSkill(slot, slotKey) {
	if (!slot || slot.type === 'none' || !Session.Entity) return false;
	let skillId = 0;
	let level = 1;

	if (slot.type === 'shortcut') {
		const sc = ShortCut._list && ShortCut._list[Number(slot.key)];
		if (!sc || !sc.isSkill || !sc.ID) return false;
		skillId = sc.ID;
		level = sc.count || 1;
	} else if (slot.type === 'skill') {
		skillId = Number(slot.skillId);
		level = Number(slot.level) || 1;
	}

	if (!skillId) return false;
	if (isSkillSlotUnavailable(slotKey, skillId)) return false;
	if (!canUseSkillSlot(slot, slotKey)) return false;

	if (castSkillOnTarget(skillId, level, Session.Entity)) {
		const lastCast = lastSkillAction;
		skillSlotLastUsed.set(slotKey, lastCast);
		pendingSkillAttempt = { slotKey, skillId, at: lastCast };
		skillFailureRecovery = false;
		return true;
	}
	return false;
}

function useItemByIndex(index) {
	if (!index || !canAct()) return;
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.USE_ITEM2() : new PACKET.CZ.USE_ITEM();
	packet.index = index;
	packet.AID = Session.Entity.GID;
	Network.sendPacket(packet);
	lastAction = Date.now();
}

function usePotionByITID(itid) {
	if (!itid || !canAct()) return false;
	const item = (Inventory.getUI().list || []).find(it => it && Number(it.ITID) === Number(itid) && it.count > 0);
	if (!item) return false;
	useItemByIndex(item.index);
	return true;
}

function attackEntity(entity) {
	if (!canAttack()) return false;
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_ACT2() : new PACKET.CZ.REQUEST_ACT();
	packet.action = 7;
	packet.targetGID = entity.GID;
	Network.sendPacket(packet);
	lastAttackAction = Date.now();
	return true;
}

// -------------------------------------------------------------
// GAME LOOP (TICK)
// -------------------------------------------------------------
function tick() {
	if (!document.getElementById('autoCombatHudIcon')) {
		addIcon();
	}

	if (!Session.Entity) return;
	if (pendingSkillAttempt && Date.now() - pendingSkillAttempt.at > SKILL_FAILURE_WINDOW_MS) {
		pendingSkillAttempt = null;
	}

	const life = Session.Entity.life;
	if (!life || life.hp <= 0) return;
	observeActiveBuffDurations();

	// 1. Potions: 2 HP slots, 2 SP slots (by ITID)
	if (preferences.autoPotion && life.hp_max > 0) {
		const hpPct = (life.hp / life.hp_max) * 100;
		if (preferences.hpItem2 && hpPct <= preferences.hpPercent2) {
			usePotionByITID(preferences.hpItem2);
		} else if (preferences.hpItem1 && hpPct <= preferences.hpPercent1) {
			usePotionByITID(preferences.hpItem1);
		}
	}
	if (preferences.autoPotion && life.sp_max > 0) {
		const spPct = (life.sp / life.sp_max) * 100;
		if (preferences.spItem2 && spPct <= preferences.spPercent2) {
			usePotionByITID(preferences.spItem2);
		} else if (preferences.spItem1 && spPct <= preferences.spPercent1) {
			usePotionByITID(preferences.spItem1);
		}
	}

	// 2. Buff Items (8 slots)
	if (preferences.autoBuffItem && canAct()) {
		const now = Date.now();
		preferences.buffItems.forEach(slot => {
			if (!slot || !slot.itemId) return;
			const itemId = Number(slot.itemId);
			let last = buffItemLastUsed.get(itemId);
			let duration = slot.autoDuration ? getBuffDurationSeconds(itemId) : 0;
			if (slot.autoDuration && last === undefined) {
				const activeRemaining = getMatchingItemStatusRemaining(itemId, previousStatusTimers);
				if (activeRemaining) {
					if (activeRemaining > duration) {
						duration = activeRemaining;
						observedBuffItemDurations.set(itemId, duration);
					}
					last = now - Math.max(0, duration - activeRemaining) * 1000;
					buffItemLastUsed.set(itemId, last);
				}
			}
			const intervalMs = (duration || Number(slot.interval) || 60) * 1000;
			if (now - (last || 0) >= intervalMs) {
				const item = (Inventory.getUI().list || []).find(it => it && Number(it.ITID) === itemId && it.count > 0);
				if (item) {
					useItemByIndex(item.index);
					buffItemLastUsed.set(itemId, now);
				}
			}
		});
	}

	// 3. Buff Skills (Page 3)
	const canAutoAttack = preferences.enabled && preferences.attack;
	const canAutoSkill = preferences.enabled && preferences.autoSkill;
	const spPct = life.sp_max > 0 ? (life.sp / life.sp_max) * 100 : 100;
	const lowSpNormalOnly =
		canAutoSkill && preferences.lowSpNormalAttack && spPct <= preferences.lowSpPercent;
	if (canAutoSkill && !lowSpNormalOnly && canAct() && (!isPlayerCasting() || skillFailureRecovery)) {
		for (const [index, slot] of preferences.skillsBuff.entries()) {
			if (castBuffSkill(slot, `skillsBuff:${index}`)) break;
		}
	}

	// 4. Stop looting at the configured weight threshold and optionally return.
	const weightReturnPending = handleWeightReturn();
	const canLoot = preferences.loot && !weightReturnPending;

	// 5. Looting
	if (canLoot) {
		if (pendingPickupGID) {
			if (Date.now() - pendingPickupAt < PICKUP_CONFIRM_TIMEOUT) return;
			const timedOutGID = pendingPickupGID;
			clearPickupRequest();
			if (EntityManager.get(timedOutGID)) {
				registerPickupFailure(timedOutGID);
			} else {
				pickupFailures.delete(timedOutGID);
				ignoredPickupGIDs.delete(timedOutGID);
			}
		}

		const item = getGroundItem();
		if (item) {
			if (!canAct()) return;
			if (moveToTarget(item)) return;
			const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.ITEM_PICKUP2() : new PACKET.CZ.ITEM_PICKUP();
			const gid = Number(item.GID);
			packet.ITAID = gid;
			pendingPickupGID = gid;
			pendingPickupAt = Date.now();
			Network.sendPacket(packet);
			lastAction = Date.now();
			return;
		}
	}

	// 6. Targeting & Skill Spam Loop
	if (canAutoAttack || canAutoSkill) {
		const target = getTarget();
		if (target) {
			if (!isPlayerCasting() || skillFailureRecovery) {
				let skillExecuted = false;
				const allowSkills = canAutoSkill && !lowSpNormalOnly;

				if (allowSkills) {
					// Page 1: Attack Skills 1-8
					for (const [index, slot] of preferences.skillsPage1.entries()) {
						if (useSkillOnTarget(slot, target, `skillsPage1:${index}`)) {
							skillExecuted = true;
							break;
						}
					}
					// Page 2: Attack Skills 9-16
					if (!skillExecuted) {
						for (const [index, slot] of preferences.skillsPage2.entries()) {
							if (useSkillOnTarget(slot, target, `skillsPage2:${index}`)) {
								skillExecuted = true;
								break;
							}
						}
					}
				}

				if (
					!skillExecuted &&
					(canAutoAttack || lowSpNormalOnly || (canAutoSkill && allAttackSkillSlotsUnavailable()))
				) {
					if (moveToTarget(target)) return;
					if (attackEntity(target)) skillFailureRecovery = false;
				}
			}
		} else if (canAutoAttack) {
			wander();
		}
	}
}

// -------------------------------------------------------------
// TARGETING & MOVEMENT
// -------------------------------------------------------------
function isUnreachableTarget(gid) {
	const ignoredUntil = unreachableTargets.get(Number(gid)) || 0;
	if (ignoredUntil && ignoredUntil > Date.now()) return true;
	if (ignoredUntil) unreachableTargets.delete(Number(gid));
	return false;
}

function resetTargetProgress() {
	trackedTargetGID = 0;
	trackedPlayerPosition = null;
	targetStuckSince = 0;
}

function markTargetUnreachable(gid) {
	unreachableTargets.set(Number(gid), Date.now() + UNREACHABLE_TARGET_COOLDOWN);
	if (targetGID === gid) targetGID = 0;
	resetTargetProgress();
}

function moveToTarget(entity) {
	if (!Session.Entity || !entity || !entity.position) return false;
	const dx = entity.position[0] - Session.Entity.position[0];
	const dy = entity.position[1] - Session.Entity.position[1];
	if (Math.hypot(dx, dy) <= 2) return false;

	const gid = Number(entity.GID);
	const playerX = Session.Entity.position[0];
	const playerY = Session.Entity.position[1];

	if (trackedTargetGID !== gid) {
		trackedTargetGID = gid;
		trackedPlayerPosition = { x: playerX, y: playerY };
		targetStuckSince = Date.now();
	} else if (
		trackedPlayerPosition &&
		Math.hypot(playerX - trackedPlayerPosition.x, playerY - trackedPlayerPosition.y) >= 1
	) {
		trackedPlayerPosition = { x: playerX, y: playerY };
		targetStuckSince = Date.now();
	}

	if (Date.now() - targetStuckSince >= TARGET_STUCK_TIMEOUT) {
		markTargetUnreachable(gid);
		return true;
	}

	if (!canAttack()) return true;
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_MOVE2() : new PACKET.CZ.REQUEST_MOVE();
	packet.dest[0] = Math.round(entity.position[0]);
	packet.dest[1] = Math.round(entity.position[1]);
	Network.sendPacket(packet);
	lastAttackAction = Date.now();
	return true;
}

function isAllowedMonster(entity) {
	if (!preferences.monsters || preferences.monsters.length === 0) return false;

	const selected = new Set(
		(Array.isArray(preferences.monsters) ? preferences.monsters : [])
			.map(id => String(normalizeMonsterId(id)))
			.filter(id => id !== '0')
	);
	// Use the real monster DB job ID from entity
	const candidates = [
		normalizeMonsterId(entity._job),
		normalizeMonsterId(entity.job),
		normalizeMonsterId(entity._effectiveJob)
	].filter(Boolean);

	return candidates.some(val => selected.has(String(val)));
}

function getTarget() {
	const current = targetGID ? EntityManager.get(targetGID) : null;
	if (
		current &&
		current.objecttype === Entity.TYPE_MOB &&
		current.action !== current.ACTION.DIE &&
		current.life.hp !== 0 &&
		isAllowedMonster(current) &&
		!isUnreachableTarget(current.GID)
	) {
		return current;
	}
	resetTargetProgress();
	targetGID = 0;
	let target = null;
	EntityManager.forEach(entity => {
		if (target || entity.objecttype !== Entity.TYPE_MOB || entity.action === entity.ACTION.DIE || entity.life.hp === 0) return;
		if (isUnreachableTarget(entity.GID)) return;
		if (!isAllowedMonster(entity)) return;
		target = entity;
		targetGID = entity.GID;
	});
	return target;
}

function wander() {
	if (!Session.Entity || Date.now() - lastWander < 1200 || !canAttack()) return;
	const origin = Session.Entity.position;
	const angle = Math.random() * Math.PI * 2;
	const distance = 8 + Math.floor(Math.random() * 13);
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_MOVE2() : new PACKET.CZ.REQUEST_MOVE();
	packet.dest[0] = Math.max(1, Math.round(origin[0] + Math.cos(angle) * distance));
	packet.dest[1] = Math.max(1, Math.round(origin[1] + Math.sin(angle) * distance));
	Network.sendPacket(packet);
	lastWander = Date.now();
	lastAttackAction = lastWander;
}

function getGroundItem() {
	let closest = null;
	let closestDistance = Infinity;
	EntityManager.forEach(entity => {
		if (entity.objecttype !== Entity.TYPE_ITEM && entity.objecttype !== Entity.TYPE_ITEM2) return;
		if (!canLootItem(entity)) return;
		const gid = Number(entity.GID);
		if (ignoredPickupGIDs.has(gid)) return;
		const dx = entity.position[0] - Session.Entity.position[0];
		const dy = entity.position[1] - Session.Entity.position[1];
		const distance = dx * dx + dy * dy;
		if (distance < closestDistance) {
			closest = entity;
			closestDistance = distance;
		}
	});
	return closest;
}

function registerPickupFailure(gid) {
	const count = (pickupFailures.get(gid) || 0) + 1;
	pickupFailures.set(gid, count);
	if (count >= MAX_PICKUP_ATTEMPTS) {
		ignoredPickupGIDs.add(gid);
	}
}

function clearPickupRequest() {
	pendingPickupGID = 0;
	pendingPickupAt = 0;
}

// -------------------------------------------------------------
// TIMER & WINDOW VISIBILITY
// -------------------------------------------------------------
function start() {
	if (!timer) {
		timer = setInterval(() => {
			tick();
		}, 180);
	}
}

function stop() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

function open() {
	preferences.show = true;
	preferences.save();
	component._host.style.display = '';
	component.focus();
	const root = component.getRoot();
	refreshMonsters(root);
	refreshItems(root);
	renderSkillSlots(root);
	renderItemBuffSlots(root);
}

function close() {
	preferences.show = false;
	preferences.x = parseInt(component._host.style.left, 10) || preferences.x;
	preferences.y = parseInt(component._host.style.top, 10) || preferences.y;
	preferences.save();
	component._host.style.display = 'none';
}

function ensureGlobalStyles() {
	if (document.getElementById('autocombat-hud-styles')) return;
	const style = document.createElement('style');
	style.id = 'autocombat-hud-styles';
	style.textContent = `
		#autoCombatHudIcon {
			position: absolute !important;
			top: 28px !important;
			right: 145px !important;
			width: 43px !important;
			height: 43px !important;
			border-radius: 6px !important;
			cursor: none !important;
			user-select: none !important;
			z-index: 50 !important;
			background: #1c2331 !important;
			border: 1px solid #8797b1 !important;
			color: #e2edff !important;
			font: bold 11px Arial, sans-serif !important;
			box-sizing: border-box !important;
			animation: none !important;
			transition: none !important;
		}
	`;
	document.head.appendChild(style);
}

function addIcon() {
	let icon = document.getElementById('autoCombatHudIcon');
	if (icon && document.body.contains(icon)) {
		return;
	}

	if (icon) icon.remove();

	ensureGlobalStyles();

	icon = document.createElement('button');
	icon.id = 'autoCombatHudIcon';
	icon.type = 'button';
	icon.textContent = 'Auto';
	icon.title = 'Apri AutoCombat';
	icon.setAttribute('aria-label', 'Apri AutoCombat');

	icon.addEventListener('click', event => {
		event.stopPropagation();
		open();
	});

	icon.addEventListener('contextmenu', e => {
		e.preventDefault();
		e.stopPropagation();
	});

	icon.addEventListener('touchstart', event => {
		event.preventDefault();
		event.stopPropagation();
		open();
	}, { passive: false });

	document.body.appendChild(icon);
}

export default UIManager.addComponent(component);
