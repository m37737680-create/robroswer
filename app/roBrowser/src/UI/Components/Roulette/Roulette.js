/**
 * UI/Components/Roulette/Roulette.js
 *
 * Roulette window
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author [Your Name]
 */

import DB from 'DB/DBManager.js';
import Client from 'Core/Client.js';
import Preferences from 'Core/Preferences.js';
import Renderer from 'Renderer/Renderer.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import PACKETVER from 'Network/PacketVerManager.js';
import htmlText from './Roulette.html?raw';
import cssText from './Roulette.css?raw';

/**
 * Create Component
 */
const Roulette = new GUIComponent('Roulette', cssText);

/**
 * Render HTML
 */
Roulette.render = () => htmlText;

/**
 * @var {Preferences} structure
 */
const _preferences = Preferences.get(
	'Roulette',
	{
		x: 200,
		y: 200,
		show: false
	},
	1.0
);

function positionRouletteWindow() {
	const host = Roulette._host;
	if (!host) return;

	const viewportWidth = window.visualViewport?.width || Renderer.width || window.innerWidth;
	const viewportHeight = window.visualViewport?.height || Renderer.height || window.innerHeight;
	const width = host.offsetWidth || 600;
	const height = host.offsetHeight || 500;
	const scale = Math.min(1, (viewportWidth - 16) / width, (viewportHeight - 16) / height);
	const safeScale = Math.max(0.1, scale);

	host.style.transformOrigin = 'top left';
	host.style.transform = safeScale < 1 ? `scale(${safeScale})` : '';
	host.style.left =
		safeScale < 1
			? `${Math.max(0, (viewportWidth - width * safeScale) / 2)}px`
			: `${Math.min(Math.max(0, _preferences.x), viewportWidth - width)}px`;
	host.style.top =
		safeScale < 1
			? `${Math.max(0, (viewportHeight - height * safeScale) / 2)}px`
			: `${Math.min(Math.max(0, _preferences.y), viewportHeight - height)}px`;
}

function onRouletteViewportResize() {
	if (Roulette._host?.style.display !== 'none') positionRouletteWindow();
}

/**
 * @var {object} Roulette data
 */
const _rouletteInfo = {
	step: 0,
	idx: 0,
	goldPoint: 0,
	silverPoint: 0,
	bronzePoint: 0,
	additionItemID: 0,
	items: []
};

/**
 * @var {boolean} Is spinning
 */
let _isSpinning = false;
let _spinRequestPending = false;
let _receiveRequestPending = false;
let _spinRequestTimeout = null;
let _receiveRequestTimeout = null;
let _spinAnimationTimeout = null;

/**
 * Initialize UI
 */
Roulette.init = function init() {
	const root = this.getRoot();

	root.querySelector('.close').addEventListener('click', () => {
		Roulette.onClose();
	});

	root.querySelector('.btn-claim').addEventListener('click', () => {
		Roulette.requestReceiveItem();
	});

	root.querySelector('.btn-spin').addEventListener('click', () => {
		if (!_isSpinning) {
			Roulette.onSpin();
		}
	});

	root.querySelector('.btn-info').addEventListener('click', () => {
		Roulette.onInfo();
	});

	root.querySelector('.roulette-help-close').addEventListener('click', () => {
		const help = root.querySelector('.roulette-help');
		const button = root.querySelector('.btn-info');
		help.hidden = true;
		button.setAttribute('aria-expanded', 'false');
	});

	this.draggable('.titlebar');
	window.addEventListener('resize', onRouletteViewportResize);
	window.visualViewport?.addEventListener('resize', onRouletteViewportResize);
};

/**
 * @var {number} Timeout ID for server response
 */
let _responseTimeout = null;

/**
 * Click on roulette icon
 */
function onClickIcon() {
	if (Roulette._host.style.display !== 'none') {
		Roulette.onClose();
		return;
	}

	const pkt = new PACKET.CZ.REQ_OPEN_ROULETTE();
	Network.sendPacket(pkt);

	if (_responseTimeout) {
		clearTimeout(_responseTimeout);
	}

	_responseTimeout = setTimeout(() => {
		_responseTimeout = null;
	}, 2000);
}

/**
 * Once append to the DOM
 */
Roulette.onAppend = function onAppend() {
	positionRouletteWindow();

	if (!_preferences.show) {
		this._host.style.display = 'none';
	}

	if (ROConfig.enableRoulette === false) {
		return;
	}

	if (PACKETVER.value < 20141008) {
		return;
	}

	addRouletteIcon();
};

/**
 * @var {HTMLButtonElement|null} Standalone roulette icon (light DOM)
 */
let _iconBtn = null;

/**
 * Create the roulette icon as a standalone light-DOM button.
 */
function addRouletteIcon() {
	if (_iconBtn) {
		return;
	}
	_iconBtn = document.createElement('button');
	_iconBtn.className = 'rouletteIcon';
	Object.assign(_iconBtn.style, {
		position: 'absolute',
		top: '74px',
		right: '145px',
		width: '43px',
		height: '43px',
		border: 'none',
		backgroundColor: 'transparent',
		backgroundRepeat: 'no-repeat',
		backgroundSize: 'contain',
		backgroundPosition: 'center',
		zIndex: '50',
		cursor: 'pointer'
	});
	_iconBtn.addEventListener('mousedown', e => e.stopImmediatePropagation());
	_iconBtn.addEventListener('click', onClickIcon);
	document.body.appendChild(_iconBtn);
	const iconPath = 'basic_interface/roullette/RoulletteIcon.bmp';
	Client.loadFile(DB.INTERFACE_PATH + iconPath, function (data) {
		if (_iconBtn) {
			_iconBtn.style.backgroundImage = `url(${data})`;
		}
	});
}

/**
 * Remove from DOM
 */
Roulette.onRemove = function onRemove() {
	if (_iconBtn) {
		_iconBtn.remove();
		_iconBtn = null;
	}
	_isSpinning = false;
	_spinRequestPending = false;
	_receiveRequestPending = false;
	clearTimeout(_spinRequestTimeout);
	clearTimeout(_receiveRequestTimeout);
	clearTimeout(_spinAnimationTimeout);
	_spinRequestTimeout = null;
	_receiveRequestTimeout = null;
	_spinAnimationTimeout = null;
	_preferences.show = this._host.style.display !== 'none';
	_preferences.x = parseInt(this._host.style.left, 10);
	_preferences.y = parseInt(this._host.style.top, 10);
	_preferences.save();
};

/**
 * Open Roulette Window
 */
Roulette.onOpen = function onOpen(pkt) {
	if (pkt) {
		_rouletteInfo.step = pkt.step || 0;
		_rouletteInfo.idx = pkt.idx || 0;
		_rouletteInfo.goldPoint = pkt.goldPoint || 0;
		_rouletteInfo.silverPoint = pkt.silverPoint || 0;
		_rouletteInfo.bronzePoint = pkt.bronzePoint || 0;
		_rouletteInfo.additionItemID = pkt.additionItemID || 0;
	}

	const help = this.getRoot().querySelector('.roulette-help');
	const infoButton = this.getRoot().querySelector('.btn-info');
	help.hidden = true;
	infoButton.setAttribute('aria-expanded', 'false');
	this._host.style.display = '';
	positionRouletteWindow();
	this.generateWheelSlots();
	this.updateUI();
	this.focus();
};

/**
 * Close Roulette Window
 */
Roulette.onClose = function onClose() {
	Roulette._host.style.display = 'none';

	const pkt = new PACKET.CZ.REQ_CLOSE_ROULETTE();
	Network.sendPacket(pkt);
};

/**
 * Request to spin the roulette
 */
Roulette.onSpin = function onSpin() {
	if (_isSpinning || _spinRequestPending) {
		return;
	}

	_spinRequestPending = true;
	this.updateUI();
	const pkt = new PACKET.CZ.REQ_GENERATE_ROULETTE();
	Network.sendPacket(pkt);
	_spinRequestTimeout = setTimeout(() => {
		_spinRequestPending = false;
		_spinRequestTimeout = null;
		console.error('[Roulette] No response received for the spin request.');
		this.updateUI();
	}, 10000);
};

/**
 * Handle roulette item list response
 */
Roulette.onRouletteInfo = function onRouletteInfo(pkt) {
	if (pkt && pkt.items) {
		_rouletteInfo.items = pkt.items;
		_rouletteInfo.serial = pkt.serial;
		const missingItemIds = [
			...new Set(
				pkt.items
					.map(getRouletteItemId)
					.filter(
						itemId =>
							itemId &&
							DB.getItemInfo(Number(itemId)).identifiedDisplayName === 'Unknown Item'
					)
			)
		];
		if (missingItemIds.length) {
			console.warn(
				'[Roulette] Reward item data is missing from the client database:',
				missingItemIds
			);
		}
	}

	Roulette.generateWheelSlots();
};

/**
 * Show info window
 */
Roulette.onInfo = function onInfo() {
	const help = this.getRoot().querySelector('.roulette-help');
	const button = this.getRoot().querySelector('.btn-info');
	help.hidden = !help.hidden;
	button.setAttribute('aria-expanded', String(!help.hidden));
};

/**
 * Update UI with current roulette data
 */
Roulette.updateUI = function updateUI() {
	const root = this.getRoot();

	const btnSpin = root.querySelector('.btn-spin');
	if (btnSpin) {
		btnSpin.disabled = _isSpinning || _spinRequestPending;
	}

	root.querySelector('.gold-points').textContent = String(_rouletteInfo.goldPoint);
	root.querySelector('.silver-points').textContent = String(_rouletteInfo.silverPoint);
	root.querySelector('.bronze-points').textContent = String(_rouletteInfo.bronzePoint);

	const btnReceive = root.querySelector('.btn-claim');
	if (btnReceive) btnReceive.disabled = _receiveRequestPending;
};

function getRouletteItemId(item) {
	return item?.itemId ?? item?.item_id ?? item?.ItemID ?? 0;
}

function getPyramidPosition(index, item) {
	const row = Number(item?.row);
	const position = Number(item?.position);
	const hasValidPacketPosition =
		Number.isInteger(row) &&
		row >= 0 &&
		row <= 6 &&
		Number.isInteger(position) &&
		position >= 0 &&
		position < 9 - row;
	if (hasValidPacketPosition) {
		return { row: 7 - row, column: row + position + 1 };
	}

	let offset = index;
	for (let sourceRow = 0; sourceRow < 7; sourceRow++) {
		const rowSize = 9 - sourceRow;
		if (offset < rowSize) {
			return { row: 7 - sourceRow, column: sourceRow + offset + 1 };
		}
		offset -= rowSize;
	}

	return { row: 7, column: 1 };
}

function setRouletteItemImage(element, itemId) {
	if (!itemId) return;

	const itemInfo = DB.getItemInfo(Number(itemId));
	const itemName =
		itemInfo?.identifiedDisplayName || itemInfo?.unidentifiedDisplayName || `Item ${itemId}`;
	element.title = `${itemName} (#${itemId})`;
	const resourceName =
		itemInfo && (itemInfo.identifiedResourceName || itemInfo.unidentifiedResourceName);
	if (!resourceName) {
		console.warn(`[Roulette] Missing item icon resource for item ${itemId}.`);
		return;
	}

	const path = `${DB.INTERFACE_PATH}item/${resourceName}.bmp`;
	Client.loadFile(
		path,
		data => {
			if (!element.isConnected) return;
			if (!data) {
				console.error(`[Roulette] Empty icon file: ${path}`);
				return;
			}
			element.style.backgroundImage = `url(${data})`;
		},
		error => console.error(`[Roulette] Failed to load item icon: ${path}`, error)
	);
}

/**
 * Generate wheel slots from items
 */
Roulette.generateWheelSlots = function generateWheelSlots() {
	const root = this.getRoot();
	const wheelSlots = root.querySelector('.wheel-slots');
	if (!wheelSlots) {
		return;
	}
	wheelSlots.innerHTML = '';
	wheelSlots.style.transform = '';

	const items = _rouletteInfo.items || [];
	const numSlots = items.length || 10;

	for (let i = 0; i < numSlots; i++) {
		const slot = document.createElement('div');
		slot.className = 'wheel-slot';
		slot.setAttribute('data-index', i);
		if (items[i]) {
			const position = getPyramidPosition(i, items[i]);
			slot.style.gridRowStart = position.row;
			slot.style.gridColumnStart = position.column;
		} else {
			const position = getPyramidPosition(i, null);
			slot.style.gridRowStart = position.row;
			slot.style.gridColumnStart = position.column;
		}

		wheelSlots.appendChild(slot);
		if (items[i]) {
			const icon = document.createElement('div');
			icon.className = 'item-icon';
			slot.appendChild(icon);
			setRouletteItemImage(icon, getRouletteItemId(items[i]));
		}
	}
};

/**
 * Start spinning animation
 */
Roulette.startSpin = function startSpin(resultIndex) {
	if (_isSpinning) {
		return;
	}

	_isSpinning = true;
	const root = this.getRoot();
	const btnSpin = root.querySelector('.btn-spin');
	if (btnSpin) {
		btnSpin.disabled = true;
	}

	const wheelSlots = root.querySelector('.wheel-slots');
	if (!wheelSlots) {
		_isSpinning = false;
		if (btnSpin) {
			btnSpin.disabled = false;
		}
		return;
	}
	const slots = Array.from(wheelSlots.querySelectorAll('.wheel-slot'));
	if (!slots.length) {
		_isSpinning = false;
		if (btnSpin) btnSpin.disabled = false;
		return;
	}

	const normalizedIndex = ((Number(resultIndex) % slots.length) + slots.length) % slots.length;
	const startedAt = Date.now();
	let activeIndex = 0;

	const animateNextSlot = () => {
		slots.forEach(slot => slot.classList.remove('active', 'winner'));
		slots[activeIndex].classList.add('active');

		const elapsed = Date.now() - startedAt;
		if (elapsed >= 3000) {
			slots.forEach(slot => slot.classList.remove('active'));
			slots[normalizedIndex].classList.add('winner');
			_spinAnimationTimeout = null;
			_isSpinning = false;
			if (btnSpin) btnSpin.disabled = false;
			Roulette.showResult(resultIndex);
			return;
		}

		activeIndex = (activeIndex + 1) % slots.length;
		_spinAnimationTimeout = setTimeout(animateNextSlot, 70 + (elapsed / 3000) * 280);
	};

	animateNextSlot();
};

/**
 * Show result after spin
 */
Roulette.showResult = function showResult(resultIndex) {
	const root = this.getRoot();
	const resultDisplay = root.querySelector('.result-item');
	if (!resultDisplay) {
		return;
	}
	resultDisplay.style.backgroundImage = '';

	const item = _rouletteInfo.items[Number(resultIndex)];
	setRouletteItemImage(resultDisplay, getRouletteItemId(item));
};

/**
 * Handle roulette result from server
 */
Roulette.onResult = function onResult(pkt) {
	_spinRequestPending = false;
	clearTimeout(_spinRequestTimeout);
	_spinRequestTimeout = null;
	if (pkt.result !== 0) {
		console.error(`[Roulette] Spin request failed (${pkt.result}).`);
		this.updateUI();
		return;
	}

	if (pkt.step !== undefined) {
		_rouletteInfo.step = pkt.step;
	}

	if (pkt.idx !== undefined) {
		_rouletteInfo.idx = pkt.idx;
	}

	if (pkt.remainGold !== undefined) {
		_rouletteInfo.goldPoint = pkt.remainGold;
	}
	if (pkt.remainSilver !== undefined) {
		_rouletteInfo.silverPoint = pkt.remainSilver;
	}
	if (pkt.remainBronze !== undefined) {
		_rouletteInfo.bronzePoint = pkt.remainBronze;
	}

	this.updateUI();
	if (pkt.idx !== undefined) {
		const resultIndex = _rouletteInfo.items.findIndex(
			item => Number(item.row) === Number(pkt.step) && Number(item.position) === Number(pkt.idx)
		);
		Roulette.startSpin(resultIndex >= 0 ? resultIndex : pkt.idx);
	}
};

/**
 * Handle item received from server
 */
Roulette.onItemReceived = function onItemReceived(pkt) {
	_receiveRequestPending = false;
	clearTimeout(_receiveRequestTimeout);
	_receiveRequestTimeout = null;
	if (pkt.result === 0) {
		_rouletteInfo.additionItemID = 0;
		const resultDisplay = this.getRoot().querySelector('.result-item');
		if (resultDisplay) resultDisplay.style.backgroundImage = '';
	}
	Roulette.updateUI();
};

/**
 * Request to receive the roulette item
 */
Roulette.requestReceiveItem = function requestReceiveItem(condition) {
	if (_receiveRequestPending) {
		return;
	}

	_receiveRequestPending = true;
	this.updateUI();
	const pkt = new PACKET.CZ.RECV_ROULETTE_ITEM();
	pkt.condition = condition || 0;
	Network.sendPacket(pkt);
	_receiveRequestTimeout = setTimeout(() => {
		_receiveRequestPending = false;
		_receiveRequestTimeout = null;
		console.error('[Roulette] No response received for the prize request.');
		this.updateUI();
	}, 10000);
};

/**
 * Export
 */
export default UIManager.addComponent(Roulette);
