var Circuit = (function ($, multidrag, Workshop) {
	"use strict";

	var my = {},
		workshop = null,
		changeListeners = [],
		isMinimized = false,
		minimizeIcon = null,
		backDrag = null,
		ifaceEnabledOutside = true,
		MINIMIZE_X = 0.1,
		MINIMIZE_Y = 0.03,
		MINIMIZE_W = 0.26,
		MINIMIZE_H = 0.26;

	function getMinimizeTransform() {
		var main = $('#main_container');
		return {
			transform: 'scale(' + MINIMIZE_W + ',' + MINIMIZE_H + ')',
			left: main.width() * ((MINIMIZE_W - 1) / 2 + MINIMIZE_X) + 'px',
			top: main.height() * ((MINIMIZE_H - 1) / 2 + MINIMIZE_Y) + 'px',
			borderWidth: '4px'
		};
	}

	function ShowClipboardGesture(e) {
		e.preventDefault();
		Clipboard.setVisible(true);
	}

	function MinimizeGesture(e) {
		e.preventDefault();
		setMinimized(true);
	}

	function UnminimizeGesture(e) {
		e.preventDefault();
		setMinimized(false);
	}

	function computeHandler(e) {
		var offs, x, y;

		if (Clipboard.isInClipboardTip(e.pageX, e.pageY)) {
			return new ShowClipboardGesture(e);
		}

		if (minimizeIcon !== null) {
			offs = minimizeIcon.offset();
			x = e.pageX - offs.left;
			y = e.pageY - offs.top;
			if (x >= 0 && y >= 0 && x < minimizeIcon.width() &&
					y < minimizeIcon.height()) {
				return new MinimizeGesture(e);
			}
		}

		return null;
	}

	function setMinimized(value) {
		var main;
		
		if (isMinimized !== value) {
			main = $('#circuit');
			if (value) {
				isMinimized = true;
				setIfaceEnabled(false);

				main.stop('minimize').animate(getMinimizeTransform(),
					{ duration: 1000, queue: 'minimize' });
				main.dequeue('minimize');
				minimizeIcon.fadeOut();
				backDrag = multidrag.create(UnminimizeGesture, 'restore')
					.register(main);
			} else {
				if (backDrag !== null) {
					backDrag.unregister();
					backDrag = null;
				}
				minimizeIcon.fadeIn();
				main.stop('minimize').animate({
					transform: 'scale(1)',
					left: 0,
					top: 0,
					borderWidth: 0
				}, { complete: function () {
					isMinimized = false;
					setIfaceEnabled(ifaceEnabledOutside);
				}, duration: 1000, queue: 'minimize' });
				main.dequeue('minimize');
			}
		}
	}

	var initialized = false;

	function ensureInitialized() {
		var iface;

		if (!initialized) {
			initialized = true;
			iface = $('#circuit_iface');

			minimizeIcon = $('<img></img>')
				.attr('id', 'circMinimize')
				.attr('src', Workshop.getResourcePath('to-floor', ['svg', 'png']));
			$('#circuit').append(minimizeIcon);
		}
	}

	function updateLevel(oldLevel, newLevel) {
		var layout, outT, outElt, sourceElt, tools;

		if (oldLevel) {
			oldLevel.circuit = Workshop.stringify(workshop.layout);
		}

		if (newLevel === null) {
			$('#circuit').fadeOut();
		} else {
			ensureInitialized();
			if (newLevel.circuit) {
				layout = Workshop.parse(newLevel.circuit, CircuitPlace.elementMap);
			} else {
				layout = CircuitPlace.computeLayout(newLevel.sensors, newLevel.link,
					workshop.canvas.width(), workshop.canvas.height());
			}
			workshop.setLayout(layout);
			tools = [];
			$.each(newLevel.tools, function (i, tool) {
				tools.push(tool);
			});
			tools.push('eraser');
			workshop.setTools(tools);
			my.windowResized();
			$('#circuit').fadeIn();
		}
	}

	$(document).ready(function () {
		var main, iface;

		LevelSelector.addListener(updateLevel);

		main = $('#circuit');
		iface = $('#circuit_iface');
		if (!main.hasClass('circ-container')) {
			workshop = new Workshop.Workshop(main, iface);
			workshop.setTools(['and', 'or', 'not', 'in', 'out', 'eraser']);
			workshop.addIfaceHandler(computeHandler);

			$.each(changeListeners, function (i, listener) {
				workshop.addChangeListener(listener);
			});
		}
	});

	function Evaluator(layout) {
		var acceptPort;
		acceptPort = null;
		$.each(layout.elts, function (i, elt) {
			if (elt.type.id === 'out') {
				acceptPort = elt.ports[0];
				return false;
			}
		});

		this.state = Workshop.newInitialState(layout);
		this.acceptPort = acceptPort;
	}

	Evaluator.prototype.evaluate = function (item) {
		var state, color, shape;
		state = this.state;
		color = item.substring(0, 1);
		shape = item.substring(1, 2);
		$.each(workshop.layout.elts, function (i, elt) {
			if (elt.type.isSensor) {
				state = state.setState(elt,
					elt.type.id === color || elt.type.id === shape);
			}
		});

		state = state.evaluate();

		if (this.acceptPort) {
			state.accept = state.getValue(this.acceptPort);
		} else {
			state.accept = false;
		}
		return state;
	};

	my.getEvaluator = function () {
		return new Evaluator(workshop.layout);
	};

	my.setState = function (state) {
		workshop.setState(state);
	};

	my.getElements = function () {
		var ret, wiringPort, canvOffs, x0, y0;
		canvOffs = workshop.canvas.position();
		x0 = canvOffs.left;
		y0 = canvOffs.top;
		ret = [];
		if (!workshop || !workshop.layout) {
			return ret;
		}
		wiringPort = workshop.gesture.port0 || null;
		$.each(workshop.layout.elts, function (i, elt) {
			var ports, port, toStr, j, k;
			ports = [];
			for (j = 0; j < elt.ports.length; j += 1) {
				port = elt.ports[j];
				if (port === wiringPort) {
					toStr = 'active';
				} else {
					toStr = '';
				}
				for (k = 0; k < port.ports.length; k += 1) {
					if (toStr === '') {
						toStr += port.ports[k].elt.id;
					} else {
						toStr += ' ' + port.ports[k].elt.id;
					}
				}
				ports.push({input: port.input, connectedTo: toStr,
					x: x0 + elt.x + port.x, y: y0 + elt.y + port.y, r: 15});
			}
			ret.push({id: elt.id, type: elt.type.id, connects: ports});
		});
		return ret;
	};

	my.stringify = function () {
		return Workshop.stringify(workshop.layout);
	};

	my.windowResized = function (w, time) {
		var elt, h;

		elt = $('#circuit');
		if (typeof w === 'undefined') {
			w = elt.parent().width();
			time = 0;
		}

		h = w / 1.5;

		if (elt.is(':visible')) {
			elt.stop().animate({width: w, height: h}, time, function () {
				workshop.setSize(w, h);
				CircuitPlace.autoplace(workshop.layout, workshop.canvas.width(), workshop.canvas.height());
				workshop.layoutRearranged();
				if (isMinimized) {
					elt.css(getMinimizeTransform());
				}
			});
		} else {
			elt.css({width: w, height: h});
			workshop.setSize(w, h);
		}
	};

	function setIfaceEnabled(value, keepIface) {
		var iface = $('#circuit_iface');
		workshop.setInterfaceEnabled(value, keepIface);
		if (value) {
			iface.show();
		} else {
			if (keepIface !== true) {
				iface.hide();
			}
		}
	}

	my.setInterfaceEnabled = function (value, keepIface) {
		ifaceEnabledOutside = value;
		setIfaceEnabled(value && !isMinimized, keepIface);
	};

	my.addChangeListener = function (listener) {
		if (workshop === null) {
			changeListeners.push(listener);
		} else {
			workshop.addChangeListener(listener);
		}
	};

	my.addInterfaceHandler = function (handler) {
		workshop.addIfaceHandler(handler);
	};

	my.setMinimized = setMinimized;

	return my;
}(jQuery, multidrag, Workshop));
