/**
 * Core/Mobile.js
 *
 * Help to handle touch devices
 *
 * This file is part of ROBrowser, (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */
// TODO: resize event on mobile keyboard bug
// TODO: body overflow
// TODO: responsive design

/**
 * Import dependencies
 */
import Context from 'Core/Context.js';
import Camera from 'Renderer/Camera.js';
import Session from 'Engine/SessionStorage.js';
import Mouse from 'Controls/MouseEventHandler.js';
import KEYS from 'Controls/KeyEventHandler.js';
import MobileUI from 'UI/Components/MobileUI/MobileUI.js';

/**
 * @var {boolean} is doing a gesture ?
 */
let _processGesture = false;

/**
 * @var {number} save angle and scale value
 */
let _scale, _angle, _touches, _intersect;
let _mobileFullscreenRequest = false;
let _landscapeLockRequested = false;
let _touchState = null;
let _rotatingTouch = false;
const C_TOUCH_SWIPE_THRESHOLD = 14;

/**
 * @namespace Mobile
 */
class Mobile {
	/**
	 * Initialize
	 */
	static init() {}
}

/**
 * Remove autofocus on mobile.
 * Let the user decide to focus an input/textarea by himself
 */
const remoteAutoFocus = (function removeAutoFocusClosure() {
	let _done = false;

	return function removeAutoFocus() {
		if (_done) {
			return;
		}
		_done = true;
	};
})();

/**
 * Return distance between touches
 *
 * @param {TouchList} touches
 * @return {number} distance
 */
function touchDistance(touches) {
	const x = touches[0].pageX - touches[1].pageX;
	const y = touches[0].pageY - touches[1].pageY;

	return Math.sqrt(x * x + y * y);
}

/**
 * Get angle from touches
 *
 * @param {TouchList} touches
 * @return {number} rotation angle
 */
function touchAngle(touches) {
	const x = touches[0].pageX - touches[1].pageX;
	const y = touches[0].pageY - touches[1].pageY;

	return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Get translation size (width)
 *
 * @param {TouchList} old touches
 * @param {TouchList} new touches
 */
function touchTranslationX(oldTouches, touches) {
	const x1 = touches[0].pageX - oldTouches[0].pageX;
	const x2 = touches[1].pageX - oldTouches[1].pageX;

	if (
		x1 &&
		x2 && // need a direction
		x1 < 0 === x2 < 0 && // same direction
		Math.abs(1 - x1 / x2) < 0.25 // need a coordinate movement
	) {
		return (x1 + x2) >> 1;
	}

	return 0;
}

function isNativeUiTouch(event) {
	const path = event.composedPath ? event.composedPath() : [event.target];
	return path.some(
		node =>
			node instanceof HTMLElement &&
			(node.id === 'ChatBox' || node.id === 'AutoCombat' || node.classList.contains('autoCombatIcon'))
	);
}

/**
 * Start touching the screen
 * Process gesture, or action
 */
const onTouchStart = (function onTouchStartClosure() {
	return function (event) {
		if (isNativeUiTouch(event)) {
			_touchState = null;
			_rotatingTouch = false;
			_processGesture = false;
			_intersect = false;
			Mouse.intersect = false;
			return;
		}

		remoteAutoFocus();
		_touches = Array.from(event.touches, touch => ({
			identifier: touch.identifier,
			pageX: touch.pageX,
			pageY: touch.pageY
		}));
		event.preventDefault();
		event.stopImmediatePropagation();

		// Gesture
		if (_touches.length > 1) {
			_touchState = null;
			_scale = touchDistance(_touches);
			_angle = touchAngle(_touches);
			_processGesture = true;
			return;
		}

		const touch = _touches[0];
		_touchState = {
			identifier: touch.identifier,
			startX: touch.pageX,
			startY: touch.pageY,
			startedAt: Date.now(),
			moved: false
		};
		_rotatingTouch = false;
		_processGesture = false;
		Mouse.screen.x = touch.pageX;
		Mouse.screen.y = touch.pageY;

		_intersect = !Session.FreezeUI;
		Mouse.intersect = _intersect;
	};
})();

/**
 * Hook touch end to know when a gesture end
 * process OnMouseUp if no gesture detected
 */
function onTouchEnd(event) {
	if (isNativeUiTouch(event)) {
		return;
	}

	if (_rotatingTouch) {
		_rotatingTouch = false;
		_processGesture = false;
		_touchState = null;
		KEYS.SHIFT = false;
		Camera.rotate(false);
		Mouse.intersect = false;
		_intersect = false;
		return;
	}

	if (_processGesture) {
		_processGesture = false;
		_touchState = null;
		KEYS.SHIFT = false;
		Camera.rotate(false);
		return;
	}

	const touchState = _touchState;
	_touchState = null;
	if (!touchState || touchState.moved || !_intersect) {
		Mouse.intersect = false;
		_intersect = false;
		return;
	}

	const releaseTap = () => {
		Mouse.screen.x = touchState.startX;
		Mouse.screen.y = touchState.startY;
		if (Mobile.onTouchStart) {
			Mobile.onTouchStart();
		}
		if (Mobile.onTouchEnd) {
			Mobile.onTouchEnd();
		}
		Mouse.intersect = false;
		_intersect = false;
	};

	const delay = Math.max(0, 200 - (Date.now() - touchState.startedAt));
	if (delay) {
		window.setTimeout(releaseTap, delay);
	} else {
		releaseTap();
	}
}

/**
 * Process gesture (scale, rotate)
 * Else move.
 */
function onTouchMove(event) {
	if (isNativeUiTouch(event)) {
		return;
	}

	event.stopImmediatePropagation();

	const touches = event.touches;
	if (!touches.length) {
		return;
	}

	Mouse.screen.x = touches[0].pageX;
	Mouse.screen.y = touches[0].pageY;

	if (_touchState && touches.length === 1 && touches[0].identifier === _touchState.identifier) {
		const deltaX = touches[0].pageX - _touchState.startX;
		const deltaY = touches[0].pageY - _touchState.startY;

		if (!_touchState.moved && Math.abs(deltaX) > C_TOUCH_SWIPE_THRESHOLD) {
			if (Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
				_touchState.moved = true;
				_rotatingTouch = true;
				_processGesture = true;
				KEYS.SHIFT = false;
				Mouse.screen.x = _touchState.startX;
				Mouse.screen.y = _touchState.startY;
				Camera.startMobileRotation();
				event.preventDefault();
				return;
			}
		}

		if (Math.abs(deltaY) > C_TOUCH_SWIPE_THRESHOLD) {
			_touchState.moved = true;
		}

		if (_rotatingTouch) {
			event.preventDefault();
			return;
		}

		if (_touchState.moved) {
			event.preventDefault();
			return;
		}
	}

	// Not in gesture, just process
	if (!_processGesture) {
		return;
	}

	const scale = touchDistance(touches) - _scale;
	//var angle = touchAngle(touches) / _angle;
	const x = Math.abs(touchTranslationX(_touches, touches));

	if (!Camera.action.active && x > 10) {
		KEYS.SHIFT = false;
		Camera.rotate(true);
		return;
	}

	// Mobile camera distance stays fixed; horizontal two-finger movement only rotates.
	if (!Camera.mobileZoomLocked && Math.abs(scale) > 10) {
		Camera.zoomFinal -= scale * 0.1;
		Camera.zoomFinal = Math.min(
			Camera.zoomFinal,
			Math.abs(Camera.altitudeTo - Camera.altitudeFrom) * Camera.MAX_ZOOM
		);
		Camera.zoomFinal = Math.max(Camera.zoomFinal, 2.0);
	}
}

function updateLandscapeNotice() {
	document.body.classList.toggle(
		'mobile-landscape-required',
		Session.isTouchDevice && window.matchMedia('(orientation: portrait)').matches
	);
}

function lockLandscapeOrientation() {
	if (!Session.isTouchDevice || !Context.isFullScreen()) {
		_landscapeLockRequested = false;
		updateLandscapeNotice();
		return;
	}

	const orientation = screen.orientation;
	if (!orientation || typeof orientation.lock !== 'function') {
		updateLandscapeNotice();
		return;
	}

	if (_landscapeLockRequested) {
		return;
	}

	_landscapeLockRequested = true;
	orientation.lock('landscape').catch(error => {
		_landscapeLockRequested = false;
		console.warn('[Mobile] Unable to lock the screen to landscape orientation.', error);
		updateLandscapeNotice();
	});
}

function requestMobileFullscreen() {
	if (!Session.isTouchDevice) {
		return;
	}

	if (Context.isFullScreen()) {
		lockLandscapeOrientation();
		return;
	}

	if (_mobileFullscreenRequest) {
		return;
	}

	const root = document.documentElement;
	const requestFullscreen =
		root.requestFullscreen ||
		root.mozRequestFullScreen ||
		root.webkitRequestFullscreen;

	if (!requestFullscreen) {
		updateLandscapeNotice();
		return;
	}

	_mobileFullscreenRequest = true;
	const result = requestFullscreen.call(root);
	if (result && typeof result.then === 'function') {
		result.then(
			() => {
				_mobileFullscreenRequest = false;
				lockLandscapeOrientation();
			},
			error => {
				_mobileFullscreenRequest = false;
				console.warn('[Mobile] Unable to enter fullscreen for landscape orientation.', error);
				updateLandscapeNotice();
			}
		);
	} else {
		_mobileFullscreenRequest = false;
	}
}

function enableMobileModeForCoarsePointer() {
	if (window.matchMedia('(pointer: coarse)').matches) {
		Session.isTouchDevice = true;
		Camera.lockZoomForMobile();
		updateLandscapeNotice();
	}
}

enableMobileModeForCoarsePointer();

// Add mobile UI on touch
function touchDevice() {
	Session.isTouchDevice = true;
	Camera.lockZoomForMobile();
	updateLandscapeNotice();
	requestMobileFullscreen();

	if (Session.Playing) {
		MobileUI.show();
	}
}
window.addEventListener('touchstart', touchDevice, { once: true });
window.addEventListener('touchstart', requestMobileFullscreen, { passive: true });
window.addEventListener('resize', updateLandscapeNotice);
window.addEventListener('orientationchange', updateLandscapeNotice);
document.addEventListener('fullscreenchange', () => {
	_mobileFullscreenRequest = false;
	lockLandscapeOrientation();
});

// Touch controls
window.addEventListener('touchstart', onTouchStart, { passive: false });
window.addEventListener('touchend', onTouchEnd);
window.addEventListener('touchcancel', () => {
	if (_rotatingTouch || _processGesture) {
		Camera.rotate(false);
	}
	_rotatingTouch = false;
	_processGesture = false;
	_touchState = null;
	KEYS.SHIFT = false;
	Mouse.intersect = false;
	_intersect = false;
});
window.addEventListener('touchmove', onTouchMove);

/**
 * Export
 */
export default Mobile;
