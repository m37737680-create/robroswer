/**
 * UI/Components/Quest/QuestWindow.js
 *
 * Manage interface for Quest Window
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

import Preferences from 'Core/Preferences.js';
import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './QuestWindow.html?raw';
import cssText from './QuestWindow.css?raw';

const _preferences = Preferences.get(
	'Quest',
	{
		x: 200,
		y: 200,
		show: false,
		showwindow: true
	},
	1.0
);

/**
 * Create Component
 */
const QuestWindow = new GUIComponent('QuestWindow', cssText);
let _onQuestClick = null;
let _onQuestListChanged = null;
let _quests = {};
let _questNotShowList = [];

QuestWindow.render = () => htmlText;

/**
 * Mouse can cross this UI
 */
QuestWindow.mouseMode = GUIComponent.MouseMode.CROSS;

/**
 * Initialize the component (event listener, etc.)
 */
QuestWindow.init = function init() {};

QuestWindow.setQuestClickHandler = function setQuestClickHandler(handler) {
	_onQuestClick = typeof handler === 'function' ? handler : null;
};

QuestWindow.setQuestListChangedHandler = function setQuestListChangedHandler(handler) {
	_onQuestListChanged = typeof handler === 'function' ? handler : null;
};

QuestWindow.getQuestList = function getQuestList() {
	return _quests;
};

/**
 * Once append to the DOM, start to position the UI
 */
QuestWindow.onAppend = function onAppend() {
	if (!_preferences.showwindow) {
		this.ui.hide();
	}
	QuestWindow.ClearQuestList();
	QuestWindow.setQuestList(_quests, _questNotShowList);
};

/**
 * Clean up UI
 */
QuestWindow.clean = function clean() {
	QuestWindow.ui.hide();
};

/**
 * Set Quest list
 *
 * @param {Array} quests
 */
QuestWindow.setQuestList = function setQuestList(quests, questNotShowList) {
	_quests = quests || {};
	_questNotShowList = Array.isArray(questNotShowList) ? questNotShowList : [];
	if (_onQuestListChanged) {
		_onQuestListChanged(_quests);
	}
	let already_show = 0;
	for (const questID in _quests) {
		if (!_questNotShowList.includes(_quests[questID].questID)) {
			if (!isInCooldown(_quests[questID])) {
				const active =
					_quests[questID].active === true ||
					(typeof _quests[questID].active === 'number' && _quests[questID].active > 0) ||
					_quests[questID].active === '1' ||
					_quests[questID].active === 'true';
				if (active && already_show < 4) {
					QuestWindow.addQuestToUI(_quests[questID]);
					already_show++;
				}
			}
		}
	}
};

function isInCooldown(quest) {
	if (quest.end_time == 0) {
		return false;
	}
	const epoch_seconds = new Date() / 1000;
	if (quest.end_time > epoch_seconds) {
		return true;
	}
	return false;
}

QuestWindow.ClearQuestList = function ClearQuestList() {
	const root = this.getRoot();
	if (!root) {
		return;
	}
	const ul = root.querySelector('.quest-window-ul');
	if (ul) {
		ul.innerHTML = '';
	}
};

QuestWindow.addQuestToUI = function addQuestToUI(quest) {
	const root = this.getRoot();
	if (!root) {
		return;
	}
	const title = quest.title.length > 25 ? `${quest.title.substr(0, 25)}...` : quest.title;
	const summary = quest.summary.length > 25 ? `${quest.summary.substr(0, 25)}...` : quest.summary;
	let list = '';
	for (const huntID in quest.hunt_list) {
		list += `<li>${quest.hunt_list[huntID].mobName} ( ${quest.hunt_list[huntID].huntCount} / ${quest.hunt_list[huntID].maxCount} )</li>`;
	}
	const ul = root.querySelector('.quest-window-ul');
	if (ul) {
		ul.insertAdjacentHTML(
			'beforeend',
			`<li class="quest-window-li" data-quest-id="${quest.questID}"> <div class="quest-window-li-title">${title}</div> <div class="quest-window-li-summary">${summary}</div> <div class="quest-window-li-monster"><ul>${list}</ul></div> </li>`
		);
		const item = ul.lastElementChild;
		if (item && _onQuestClick) {
			item.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				_onQuestClick(quest);
			});
		}
	}
};

/**
 * Export
 */
export default UIManager.addComponent(QuestWindow);
