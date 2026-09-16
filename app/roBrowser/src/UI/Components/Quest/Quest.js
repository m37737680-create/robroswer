/**
 * UI/Components/Quest/Quest.js
 *
 * Lightweight pre-renewal quest log.
 */
define(function(require)
{
	'use strict';

	var DB          = require('DB/DBManager');
	var Preferences = require('Core/Preferences');
	var Renderer    = require('Renderer/Renderer');
	var UIComponent = require('UI/UIComponent');
	var htmlText    = require('text!./Quest.html');
	var cssText     = require('text!./Quest.css');

	var Quest = new UIComponent('Quest', htmlText, cssText);
	var _preferences = Preferences.get('Quest', {
		x: 180,
		y: 100
	}, 1.0);

	Quest.init = function init()
	{
		this.ui.find('.close').click(this.toggle.bind(this));
		this.draggable();
	};

	Quest.onAppend = function onAppend()
	{
		this.ui.css({
			top: Math.min(Math.max(0, _preferences.y), Renderer.height - this.ui.height()),
			left: Math.min(Math.max(0, _preferences.x), Renderer.width - this.ui.width())
		});
		this.refresh();
	};

	Quest.onRemove = function onRemove()
	{
		_preferences.x = parseInt(this.ui.css('left'), 10);
		_preferences.y = parseInt(this.ui.css('top'), 10);
		_preferences.save();
	};

	Quest.onShortCut = function onShortCut(key)
	{
		if (key.cmd === 'TOGGLE') {
			this.toggle();
		}
	};

	Quest.toggle = function toggle()
	{
		if (this.ui.is(':visible')) {
			this.hide();
		}
		else {
			this.show();
		}
	};

	Quest.refresh = function refresh()
	{
		var $list = this.ui.find('.list').empty();
		var quests = DB.getQuestList();
		var i;

		if (!quests.length) {
			$list.append('<div class="empty">Nessuna quest attiva.</div>');
			return;
		}

		for (i = 0; i < quests.length; i++) {
			$list.append(
				$('<div class="quest"></div>')
					.attr('data-quest-id', quests[i].id)
					.text(quests[i].title)
			);
		}
	};

	return Quest;
});
