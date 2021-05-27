/*
 * Referer Modifier: Modify the Referer header in HTTP requests
 * Copyright (C) 2017-2021 Fiona Klute
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
"use strict";
/* from engine.js and the content script environment: */
/* global RefererModEngine, exportFunction */
/* from tartpvule's out-of-tree hacks */
/* global OOT_Bug1424176_get, OOT_Bug1424176_set, OOT_Bug1424176_has,
    OOT_Bug1424176_delete */

var _toString = _toString || Object.prototype.toString;
var _call = _call || Function.prototype.call;

var referrerCache = referrerCache || new WeakMap();

// [NUANCE]
//  It is undefined whether static content scripts will run before or after
//  dynamic content scripts. If the dynamic script ran first, these are
//  already initialized.
var INIT_DATA;
var engine;
//  If our OOT code has been run, this will be present already.
var OOT_nonce;

function helperExportGetter(dummy, name, target)
{
	let getter = Reflect.getOwnPropertyDescriptor(dummy, name).get;
	let exported = exportFunction(getter, target);
	Reflect.defineProperty(target, name, {
		configurable: true,
		enumerable: true,
		get: exported
	});
}

// Workaround for Bug 1424176
//  "document_start" hook on child frames should fire before control is
//  returned to the parent frame"
// !! Relies on tartpvule's out-of-tree hacks :)
function do_OOT_Bug1424176()
{
	if (typeof OOT_Bug1424176_get !== "function" ||
		typeof OOT_Bug1424176_set !== "function" ||
		typeof OOT_Bug1424176_has !== "function" ||
		typeof OOT_Bug1424176_delete !== "function")
	{
		return false;
	}

	let currentCode = OOT_Bug1424176_get();
	if (typeof currentCode === "string" &&
		currentCode.startsWith(`var OOT_nonce = (${INIT_DATA.nonce});`))
	{
		return false;
	}

	let code = `var OOT_nonce = (${INIT_DATA.nonce});
		var RefererModEngine = (${RefererModEngine.toString()});
		var engine = new RefererModEngine(
			JSON.parse('${JSON.stringify(INIT_DATA.config)}'));
		var referrerCache = new WeakMap();
		var _toString = Object.prototype.toString;
		var _call = Function.prototype.call;
		${helperExportGetter.toString()}
		${installHooks_main.toString()}
		installHooks_main(window.wrappedJSObject);
	`;
	OOT_Bug1424176_set(code);
	return true;
}

function installHooks_main(unsafeWindow)
{
	// [NUANCE]
	//  The function name is exposed on .name and .toString()
	//  on the exported function, so we need to use "dummy" objects.

	// Document#referrer
	const originalGetter = Reflect.getOwnPropertyDescriptor(
		unsafeWindow.Document.prototype, "referrer").get;
	const dummy_document = {
		get referrer()
		{
			// `this` is X-ray wrapped

			// In case someone calls us on some random things
			if (_toString.call(this) !== "[object HTMLDocument]" ||
				_toString.call(Reflect.getPrototypeOf(this))
					!== "[object HTMLDocument]")
			{
				return _call.call(originalGetter, this);
			}

			// Cache to speed up in case of other Document instances
			let computedReferrer = referrerCache.get(this.wrappedJSObject);
			if (typeof computedReferrer !== "undefined")
			{
				return computedReferrer;
			}

			let url = this.URL;
			let originUrl = String(_call.call(originalGetter, this));
			computedReferrer = engine.computeReferrer(url, originUrl);
			referrerCache.set(this.wrappedJSObject, computedReferrer);

			return computedReferrer;
		}
	};
	helperExportGetter(
		dummy_document, "referrer", unsafeWindow.Document.prototype);
}

function initialize()
{
	if (typeof engine === "undefined")
	{
		engine = new RefererModEngine(INIT_DATA.config);
	}
	else
	{
		engine.setConfig(INIT_DATA.config);
	}
	do_OOT_Bug1424176();
	if (typeof OOT_nonce === "undefined")
	{
		installHooks_main(window.wrappedJSObject);
	}
}
if (typeof INIT_DATA !== "undefined")
{
	initialize();
}
