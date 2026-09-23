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
import Inventory from 'UI/Components/Inventory/Inventory.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import cssText from './AutoCombat.css?raw';

const defaults = {
	enabled: false,
	loot: false,
	attack: false,
	attackMode: 'all',
	monsters: [],
	hpItem: 0,
	hpPercent: 50,
	spItem: 0,
	spPercent: 30,
	x: 420,
	y: 120,
	show: false
};
const preferences = Preferences.get('AutoCombat', defaults, 1.0);
const component = new GUIComponent('AutoCombat', cssText);
let timer = null;
let lastAction = 0;
let lastAttackAction = 0;
let targetGID = 0;
let lastWander = 0;
let pendingPickupGID = 0;
const pickupFailures = new Map();
const MAX_PICKUP_FAILURES = 3;

function onItemPickupAnswer(pkt) {
	if (!pendingPickupGID) return;

	const gid = pendingPickupGID;
	pendingPickupGID = 0;
	if (pkt.result === 0) {
		pickupFailures.delete(gid);
		return;
	}

	const failures = (pickupFailures.get(gid) || 0) + 1;
	if (failures > MAX_PICKUP_FAILURES) {
		pickupFailures.delete(gid);
		EntityManager.remove(gid);
	} else {
		pickupFailures.set(gid, failures);
	}
}

[
	PACKET.ZC.ITEM_PICKUP_ACK,
	PACKET.ZC.ITEM_PICKUP_ACK2,
	PACKET.ZC.ITEM_PICKUP_ACK3,
	PACKET.ZC.ITEM_PICKUP_ACK5,
	PACKET.ZC.ITEM_PICKUP_ACK6,
	PACKET.ZC.ITEM_PICKUP_ACK7,
	PACKET.ZC.ITEM_PICKUP_ACK8
].forEach(packet => Network.hookPacket(packet, onItemPickupAnswer));

component.render = () => `
	<div class="autocombat">
		<div class="titlebar">
			<strong>Auto combat</strong>
			<button class="close" type="button">×</button>
		</div>
		<div class="autocombat-body">
			<section>
				<h3>Automation</h3>
				<label class="switch"><input class="auto-loot" type="checkbox"><span>Auto-loot</span></label>
				<label class="switch"><input class="auto-attack" type="checkbox"><span>Auto-attack</span></label>
				<label class="switch"><input class="auto-potion" type="checkbox"><span>Auto-potion</span></label>
			</section>
			<section class="attack-settings">
				<h3>Target selection</h3>
				<select class="attack-mode">
					<option value="all">All monsters in map</option>
					<option value="specific">Only selected monsters</option>
				</select>
				<select class="monster-list" multiple size="5"></select>
				<small class="monster-status"></small>
			</section>
			<section class="potion-settings">
				<h3>Potions</h3>
				<div class="field"><label>HP item</label><select class="hp-item"></select></div>
				<div class="field"><label>Use below <output class="hp-value"></output>%</label><input class="hp-percent" type="range" min="1" max="99"></div>
				<div class="field"><label>SP item</label><select class="sp-item"></select></div>
				<div class="field"><label>Use below <output class="sp-value"></output>%</label><input class="sp-percent" type="range" min="1" max="99"></div>
				<small class="inventory-status"></small>
			</section>
		</div>
	</div>`;

component.init = function init() {
	const root = this.getRoot();
	root.querySelector('.close').addEventListener('click', () => close());
	root.querySelector('.auto-loot').addEventListener('change', event => set('loot', event.target.checked));
	root.querySelector('.auto-attack').addEventListener('change', event => set('attack', event.target.checked));
	root.querySelector('.auto-potion').addEventListener('change', event => set('enabled', event.target.checked));
	root.querySelector('.attack-mode').addEventListener('change', event => {
		targetGID = 0;
		set('attackMode', event.target.value);
	});
	root.querySelector('.monster-list').addEventListener('change', event => {
		targetGID = 0;
		set('monsters', Array.from(event.target.selectedOptions).map(option => option.value));
	});
	root.querySelector('.hp-item').addEventListener('change', event => set('hpItem', Number(event.target.value)));
	root.querySelector('.sp-item').addEventListener('change', event => set('spItem', Number(event.target.value)));
	root.querySelector('.hp-percent').addEventListener('change', event => set('hpPercent', clampPercent(event.target.value)));
	root.querySelector('.sp-percent').addEventListener('change', event => set('spPercent', clampPercent(event.target.value)));
	this.draggable('.titlebar');
};

component.onAppend = function onAppend() {
	const root = this.getRoot();
	this._host.style.left = `${preferences.x}px`;
	this._host.style.top = `${preferences.y}px`;
	this._host.style.display = preferences.show ? '' : 'none';
	root.querySelector('.auto-loot').checked = preferences.loot;
	root.querySelector('.auto-attack').checked = preferences.attack;
	root.querySelector('.auto-potion').checked = preferences.enabled;
	root.querySelector('.attack-mode').value = preferences.attackMode;
	root.querySelector('.hp-percent').value = preferences.hpPercent;
	root.querySelector('.sp-percent').value = preferences.spPercent;
	updateThresholdLabels(root);
	refreshMonsters(root);
	refreshItems(root);
	start();
};

function open() {
	preferences.show = true;
	preferences.save();
	component._host.style.display = '';
	component.focus();
	refreshMonsters(component.getRoot());
	refreshItems(component.getRoot());
}

function close() {
	preferences.show = false;
	preferences.x = parseInt(component._host.style.left, 10) || preferences.x;
	preferences.y = parseInt(component._host.style.top, 10) || preferences.y;
	preferences.save();
	component._host.style.display = 'none';
}

function set(key, value) {
	preferences[key] = value;
	preferences.save();
	if (key === 'hpPercent' || key === 'spPercent') updateThresholdLabels(component.getRoot());
}

function clampPercent(value) {
	return Math.max(1, Math.min(99, Number(value) || 1));
}

function refreshMonsters(root) {
	const names = new Set();
	const mapName = MapRenderer.currentMap || Session.mapState?.mapName || '';
	DB.getMapMonsterTypes(mapName).forEach(monster => names.add(`${monster.id}:${monster.name}`));
	const select = root.querySelector('.monster-list');
	const selected = new Set(preferences.monsters.map(String));
	select.innerHTML = '';
	Array.from(names).sort((a, b) => a.localeCompare(b)).forEach(value => {
		const [id, ...labelParts] = value.split(':');
		const option = document.createElement('option');
		option.value = id;
		option.textContent = labelParts.join(':');
		option.selected = selected.has(id);
		select.appendChild(option);
	});
	root.querySelector('.monster-status').textContent = `${select.options.length} monster type(s) known on this map`;
}

function refreshItems(root) {
	const items = (Inventory.getUI().list || []).filter(item => {
		if (!item || item.index === undefined || Number(item.count) <= 0) return false;
		const info = DB.getItemInfo(item.ITID);
		return item.type === ItemType.HEALING || info.type === ItemType.HEALING;
	});
	const hpItems = items.filter(item => isHpHealing(item) || !isSpHealing(item));
	const spItems = items.filter(item => isSpHealing(item) || !isHpHealing(item));
	[['hp-item', hpItems, 'hpItem'], ['sp-item', spItems, 'spItem']].forEach(([className, list, preferenceKey]) => {
		const select = root.querySelector(`.${className}`);
		const selected = preferences[preferenceKey];
		select.innerHTML = '<option value="0">Disabled</option>';
		list.forEach(item => {
			const option = document.createElement('option');
			option.value = item.index;
			option.textContent = `${DB.getItemName(item)} (${item.count})`;
			option.selected = item.index === selected;
			select.appendChild(option);
		});
	});
	root.querySelector('.inventory-status').textContent = `${items.length} healing item(s) in inventory`;
}

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

function isSpHealing(item) {
	return /\b(sp|blue potion|blue herb|royal jelly|fresh fish)\b/i.test(getHealingName(item));
}

function isHpHealing(item) {
	return /\b(hp|red potion|orange potion|yellow potion|white potion|green herb|red herb|orange herb|yellow herb|white herb)\b/i.test(
		getHealingName(item)
	);
}

function updateThresholdLabels(root) {
	root.querySelector('.hp-value').textContent = preferences.hpPercent;
	root.querySelector('.sp-value').textContent = preferences.spPercent;
}

function canAct() {
	return Session.Entity && Date.now() - lastAction > 700;
}

function canAttack() {
	return Session.Entity && Date.now() - lastAttackAction > 250;
}

function useItem(index) {
	if (!index || !canAct()) return;
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.USE_ITEM2() : new PACKET.CZ.USE_ITEM();
	packet.index = index;
	packet.AID = Session.Entity.GID;
	Network.sendPacket(packet);
	lastAction = Date.now();
}

function attack(entity) {
	if (!canAttack()) return;
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_ACT2() : new PACKET.CZ.REQUEST_ACT();
	packet.action = 7;
	packet.targetGID = entity.GID;
	Network.sendPacket(packet);
	lastAttackAction = Date.now();
}

function moveToTarget(entity) {
	if (!Session.Entity || !entity || !entity.position) return false;
	const dx = entity.position[0] - Session.Entity.position[0];
	const dy = entity.position[1] - Session.Entity.position[1];
	if (Math.hypot(dx, dy) <= 3) return false;
	if (!canAttack()) return true;
	const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.REQUEST_MOVE2() : new PACKET.CZ.REQUEST_MOVE();
	packet.dest[0] = Math.round(entity.position[0]);
	packet.dest[1] = Math.round(entity.position[1]);
	Network.sendPacket(packet);
	lastAttackAction = Date.now();
	return true;
}

function getTarget() {
	const current = targetGID ? EntityManager.get(targetGID) : null;
	if (
		current &&
		current.objecttype === Entity.TYPE_MOB &&
		current.action !== current.ACTION.DIE &&
		current.life.hp !== 0 &&
		isAllowedMonster(current)
	) {
		return current;
	}
	targetGID = 0;
	let target = null;
	EntityManager.forEach(entity => {
		if (target || entity.objecttype !== Entity.TYPE_MOB || entity.action === entity.ACTION.DIE || entity.life.hp === 0) return;
		if (!isAllowedMonster(entity)) return;
		target = entity;
	});
	if (target) targetGID = target.GID;
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

function isAllowedMonster(entity) {
	if (preferences.attackMode !== 'specific') return true;
	const selected = new Set(preferences.monsters.map(value => Number(value)).filter(Number.isFinite));
	const ids = [entity._job, entity.job, entity._effectiveJob, entity.classId]
		.map(value => Number(value))
		.filter(Number.isFinite);
	return ids.some(id => selected.has(id));
}

function getGroundItem() {
	let closest = null;
	let closestDistance = Infinity;
	EntityManager.forEach(entity => {
		if (entity.objecttype !== Entity.TYPE_ITEM && entity.objecttype !== Entity.TYPE_ITEM2) return;
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

function tick() {
	if (!Session.Entity) return;
	const life = Session.Entity.life;
	if (preferences.enabled && life.hp_max > 0 && life.hp / life.hp_max * 100 <= preferences.hpPercent) useItem(preferences.hpItem);
	if (preferences.enabled && life.sp_max > 0 && life.sp / life.sp_max * 100 <= preferences.spPercent) useItem(preferences.spItem);
	if (preferences.loot) {
		const item = getGroundItem();
		if (item) {
			if (!canAct()) return;
			if (moveToTarget(item)) return;
			const packet = PACKETVER.value >= 20180307 ? new PACKET.CZ.ITEM_PICKUP2() : new PACKET.CZ.ITEM_PICKUP();
			packet.ITAID = Number(item.GID);
			pendingPickupGID = item.GID;
			Network.sendPacket(packet);
			lastAction = Date.now();
			return;
		}
	}
	if (preferences.attack) {
		const target = getTarget();
		if (target && !moveToTarget(target)) {
			attack(target);
		} else if (!target) {
			wander();
		}
	}
}

function start() {
	if (!timer) timer = setInterval(() => {
		tick();
		if (component._host && component._host.style.display !== 'none') {
			refreshMonsters(component.getRoot());
			refreshItems(component.getRoot());
		}
	}, 200);
}

function addIcon() {
	if (document.querySelector('.autoCombatIcon')) return;
	const icon = document.createElement('button');
	icon.className = 'autoCombatIcon';
	icon.type = 'button';
	icon.title = 'Auto combat settings';
	icon.textContent = 'A';
	Object.assign(icon.style, {
		position: 'absolute',
		top: '28px',
		right: '145px',
		width: '43px',
		height: '43px',
		zIndex: '50',
		cursor: 'pointer'
	});
	icon.addEventListener('click', () => component._host.style.display === 'none' ? open() : close());
	icon.addEventListener('mousedown', event => event.stopImmediatePropagation());
	document.body.appendChild(icon);
}

component.onAppend = ((onAppend) => function wrappedOnAppend() {
	onAppend.call(this);
	addIcon();
})(component.onAppend);

component.onRemove = function onRemove() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
	preferences.x = parseInt(this._host.style.left, 10) || preferences.x;
	preferences.y = parseInt(this._host.style.top, 10) || preferences.y;
	preferences.show = this._host.style.display !== 'none';
	preferences.save();
	const icon = document.querySelector('.autoCombatIcon');
	if (icon) icon.remove();
};

export default UIManager.addComponent(component);
