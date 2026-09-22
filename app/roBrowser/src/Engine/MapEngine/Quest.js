/**
 * Engine/MapEngine/Quest.js
 *
 * Manage Quest packets and UI
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

/**
 * Load dependencies
 */
import DB from 'DB/DBManager.js';
import Network from 'Network/NetworkManager.js';
import PACKET from 'Network/PacketStructure.js';
import Quest from 'UI/Components/Quest/Quest.js';
import { sanitizeHtml } from 'Utils/HtmlHelper.js';

/**
 * Quest List
 *
 * @param {object} pkt - PACKET.ZC.ALL_QUEST_LIST_V4
 */
function onAllQuestList(pkt) {
	const quest_list = {};
	const quests = Array.isArray(pkt.QuestList)
		? pkt.QuestList
		: pkt.QuestList && typeof pkt.QuestList === 'object'
			? Object.values(pkt.QuestList)
			: [];
	for (let i = 0; i < quests.length; i++) {
		const quest = quests[i];
		if (!quest || quest.questID === undefined || quest.questID === null) {
			continue;
		}
		const quest_info = DB.getQuestInfo(quest.questID) || {};
		const active =
			quest.active === undefined || quest.active === null
				? 1
				: quest.active === true ||
					  (typeof quest.active === 'number' && quest.active > 0) ||
					  quest.active === '1' ||
					  quest.active === 'true'
					? 1
					: 0;
		const local_quest = {
			questID: quest.questID,
			title: quest_info.Title || `Quest ${quest.questID}`,
			summary: quest_info.Summary || 'Open the quest details to see the objectives.',
			description: Array.isArray(quest_info.Description)
				? quest_info.Description.join('<br>')
				: quest_info.Description || 'No quest description is available.',
			icon: quest_info.IconName || 'ico_nq.bmp',
			npc_spr: quest_info.NpcSpr || null,
			npc_navi: quest_info.NpcNavi || null,
			npc_pos_x: quest_info.NpcPosX || null,
			npc_pos_y: quest_info.NpcPosY || null,
			reward_item_list: quest_info.RewardItemList || [],
			reward_exp_base: quest_info.RewardEXP || 0,
			reward_exp_job: quest_info.RewardJEXP || 0,
			active,
			recommended:
				quest.recommended === true ||
				quest.recommended === 1 ||
				quest.recommended === '1' ||
				quest_info.Recommended === true,
			pending:
				quest.pending === true ||
				quest.pending === 1 ||
				quest.pending === '1' ||
				quest_info.Pending === true,
			start_time: quest.quest_svrTime || 0,
			end_time: quest.quest_endTime || 0,
			count: quest.count,
			hunt_list: []
		};
		const hunts = Array.isArray(quest.hunt) ? quest.hunt : [];
		if (hunts.length > 0) {
			for (let j = 0; j < hunts.length; j++) {
				const hunt = hunts[j];
				const local_hunt = {
					huntID: hunt.huntID || null,
					huntIDCount: hunt.huntIDCount || 0,
					mobType: hunt.mobType || null,
					mobGID: hunt.mobGID || null,
					lvlMin: hunt.lvlMin || null,
					lvlMax: hunt.lvlMax || null,
					huntCount: hunt.huntCount || 0,
					maxCount: hunt.maxCount || 0,
					mobName: hunt.mobName || ''
				};
				const ID = hunt.huntID ? hunt.huntID : hunt.mobGID;
				local_quest.hunt_list[ID] = local_hunt; // prefer huntid over the mobGID
			}
		}
		const questID = Number(local_quest.questID);
		if (Number.isFinite(questID) && questID > 0) {
			local_quest.questID = questID;
			quest_list[questID] = local_quest;
		}
	}
	Quest.getUI().setQuestList(quest_list);
}

/**
 * Quest added
 *
 * @param {object} pkt - PACKET.ZC.ADD_QUEST3
 */
function onAddQuest(pkt) {
	const quest_info = DB.getQuestInfo(pkt.questID) || {};
	const quest = {
		questID: pkt.questID,
		title: quest_info.Title || `Quest ${pkt.questID}`,
		summary: quest_info.Summary || 'Open the quest details to see the objectives.',
		description: Array.isArray(quest_info.Description)
			? quest_info.Description.join('<br>')
			: quest_info.Description || 'No quest description is available.',
		icon: quest_info.IconName || 'ico_nq.bmp',
		npc_spr: quest_info.NpcSpr || null,
		npc_navi: quest_info.NpcNavi || null,
		npc_pos_x: quest_info.NpcPosX || null,
		npc_pos_y: quest_info.NpcPosY || null,
		reward_item_list: quest_info.RewardItemList || [],
		reward_exp_base: quest_info.RewardEXP || 0,
		reward_exp_job: quest_info.RewardJEXP || 0,
		active: pkt.active === false || pkt.active === 0 || pkt.active === '0' ? 0 : 1,
		start_time: pkt.quest_svrTime || null,
		end_time: pkt.quest_endTime || null,
		count: pkt.count,
		hunt_list: []
	};
	const hunts = Array.isArray(pkt.hunt) ? pkt.hunt : [];
	for (let i = 0; i < Math.min(Number(quest.count) || 0, hunts.length); i++) {
			const hunt = hunts[i];
			if (!hunt) {
				continue;
			}
			const local_hunt = {
				huntID: hunt.huntID || null,
				huntIDCount: hunt.huntIDCount || 0,
				mobType: hunt.mobType || null,
				mobGID: hunt.mobGID || null,
				lvlMin: hunt.lvlMin || null,
				lvlMax: hunt.lvlMax || null,
				huntCount: hunt.huntCount || 0,
				maxCount: hunt.maxCount || 0,
				mobName: hunt.mobName || ''
			};
			const ID = hunt.huntID ? hunt.huntID : hunt.mobGID;
			quest.hunt_list[ID] = local_hunt; // prefer huntid over the mobGID
	}
	Quest.getUI().addQuest(quest, quest.questID);
}

/**
 * Quest Hunt updated
 *
 * @param {object} pkt - PACKET.ZC.UPDATE_MISSION_HUNT4
 */
function onUpdateMissionHunt(pkt) {
	const hunts = Array.isArray(pkt.hunt) ? pkt.hunt : [];
	const questCount = Math.min(Number(pkt.questCount) || 0, hunts.length);
	for (let i = 0; i < questCount; i++) {
		const local_hunt = hunts[i];
		const ID = local_hunt.huntID ? local_hunt.huntID : local_hunt.mobGID;

		if (local_hunt.questID !== undefined) {
			// server sent info with questID
			if (Quest.getUI().questExists(local_hunt.questID)) {
				Quest.getUI().updateMissionHunt(local_hunt, local_hunt.questID, ID);
			} else {
				// create new one
				const quest_info = DB.getQuestInfo(local_hunt.questID) || {};
				const local_quest = {
					questID: local_hunt.questID,
					title: quest_info.Title ? sanitizeHtml(quest_info.Title) : '',
					summary: quest_info.Summary ? sanitizeHtml(quest_info.Summary) : '',
					description: quest_info.Description ? sanitizeHtml(quest_info.Description) : '',
					icon: quest_info.IconName ? quest_info.IconName : 'ico_nq.bmp',
					npc_spr: quest_info.NpcSpr || null,
					npc_navi: quest_info.NpcNavi || null,
					npc_pos_x: quest_info.NpcPosX || null,
					npc_pos_y: quest_info.NpcPosY || null,
					reward_item_list: quest_info.RewardItemList || [],
					reward_exp_base: quest_info.RewardEXP || 0,
					reward_exp_job: quest_info.RewardJEXP || 0,
					active: 1,
					start_time: null,
					end_time: null,
					count: 1,
					hunt_list: []
				};
				local_quest.hunt_list[ID] = {
					huntID: local_hunt.huntID || null,
					huntIDCount: local_hunt.huntIDCount || 0,
					mobType: local_hunt.mobType || null,
					mobGID: local_hunt.mobGID || null,
					lvlMin: local_hunt.lvlMin || null,
					lvlMax: local_hunt.lvlMax || null,
					huntCount: local_hunt.huntCount || 0,
					maxCount: local_hunt.maxCount || 0,
					mobName: local_hunt.mobName || ''
				};
				Quest.getUI().addQuest(local_quest, local_quest.questID);
			}
		} else {
			// server sent info with huntID
			const quest_saved_id = Quest.getUI().getQuestIDByServerID(ID);
			if (quest_saved_id > 0) {
				// update quest
				Quest.getUI().updateMissionHunt(local_hunt, quest_saved_id, ID);
			}
		}
	}
}

/**
 * Quest actived or disabled
 *
 * @param {object} pkt - PACKET.ZC.ACTIVE_QUEST
 */
function onActiveQuest(pkt) {
	Quest.getUI().toggleQuestActive(
		pkt.questID,
		pkt.active === true ||
			(typeof pkt.active === 'number' && pkt.active > 0) ||
			pkt.active === '1' ||
			pkt.active === 'true'
	);
}

/**
 * Quest deleted
 *
 * @param {object} pkt - PACKET.ZC.DEL_QUEST
 */
function onDeleteQuest(pkt) {
	Quest.getUI().removeQuest(pkt.questID);
}

/**
 * Initialize
 */
export default function MainEngine() {
	Network.hookPacket(PACKET.ZC.ALL_QUEST_LIST, onAllQuestList);
	Network.hookPacket(PACKET.ZC.ALL_QUEST_MISSION, onAllQuestList);
	Network.hookPacket(PACKET.ZC.ALL_QUEST_LIST_V2, onAllQuestList);
	Network.hookPacket(PACKET.ZC.ALL_QUEST_LIST_V3, onAllQuestList);
	Network.hookPacket(PACKET.ZC.ALL_QUEST_LIST_V4, onAllQuestList);
	Network.hookPacket(PACKET.ZC.ADD_QUEST, onAddQuest);
	Network.hookPacket(PACKET.ZC.ADD_QUEST2, onAddQuest);
	Network.hookPacket(PACKET.ZC.ADD_QUEST3, onAddQuest);
	Network.hookPacket(PACKET.ZC.UPDATE_MISSION_HUNT, onUpdateMissionHunt);
	Network.hookPacket(PACKET.ZC.UPDATE_MISSION_HUNT2, onUpdateMissionHunt);
	Network.hookPacket(PACKET.ZC.UPDATE_MISSION_HUNT3, onUpdateMissionHunt);
	Network.hookPacket(PACKET.ZC.UPDATE_MISSION_HUNT4, onUpdateMissionHunt);
	Network.hookPacket(PACKET.ZC.ACTIVE_QUEST, onActiveQuest);
	Network.hookPacket(PACKET.ZC.DEL_QUEST, onDeleteQuest);
}
