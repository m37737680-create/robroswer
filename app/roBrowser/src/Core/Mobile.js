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
import Events from 'Core/Events.js';
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

/**
 * Timer to detect delayed click
 */
let _timer = -1;

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

/**
 * Start touching the screen
 * Process gesture, or action
 */
const onTouchStart = (function onTouchStartClosure() {
	function delayedClick() {
		// Only process mousedown if not doing a gesture
		if (!_processGesture) {
			_timer = -1;

			if (Mobile.onTouchStart) {
				Mobile.onTouchStart();
			}

			if (!_intersect) {
				if (Mobile.onTouchEnd) {
					Mobile.onTouchEnd();
				}
			}

			Mouse.intersect = _intersect;
		}
	}

	return function (event) {
		remoteAutoFocus();
		_touches = event.touches;
		event.preventDefault();
		event.stopImmediatePropagation();

		// Delayed click (to detect gesture)
		if (_timer > -1) {
			Events.clearTimeout(_timer);
			_timer = -1;
		}

		// Gesture
		if (_touches.length > 1) {
			_scale = touchDistance(_touches);
			_angle = touchAngle(_touches);
			_processGesture = true;
			return;
		}

		Mouse.screen.x = _touches[0].pageX;
		Mouse.screen.y = _touches[0].pageY;

		if (!Session.FreezeUI) {
			Mouse.intersect = true;
			_intersect = true;
		}

		_timer = Events.setTimeout(delayedClick, 200);
	};
})();

/**
 * Hook touch end to know when a gesture end
 * process OnMouseUp if no gesture detected
 */
function onTouchEnd(event) {
	if (_processGesture) {
		_processGesture = false;
		KEYS.SHIFT = false;
		Camera.rotate(false);
		return;
	}

	if (_timer > -1) {
		_intersect = false;
		return;
	}

	if (Mobile.onTouchEnd) {
		Mobile.onTouchEnd();
	}

	Mouse.intersect = false;
}

/**
 * Process gesture (scale, rotate)
 * Else move.
 */
function onTouchMove(event) {
	event.stopImmediatePropagation();

	const touches = event.touches;

	Mouse.screen.x = touches[0].pageX;
	Mouse.screen.y = touches[0].pageY;

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
window.addEventListener('touchmove', onTouchMove);

/**
 * Export
 */
export default Mobile;
