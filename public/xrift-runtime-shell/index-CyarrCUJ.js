import { g as getDefaultExportFromCjs } from './_commonjsHelpers-BqLXS_qQ.js';
import { r as requireReact } from './index-CZFAL8r8.js';

function _mergeNamespaces(n, m) {
	for (var i = 0; i < m.length; i++) {
		const e = m[i];
		if (typeof e !== 'string' && !Array.isArray(e)) { for (const k in e) {
			if (k !== 'default' && !(k in n)) {
				const d = Object.getOwnPropertyDescriptor(e, k);
				if (d) {
					Object.defineProperty(n, k, d.get ? d : {
						enumerable: true,
						get: () => e[k]
					});
				}
			}
		} }
	}
	return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: 'Module' }));
}

var reactExports = requireReact();
const index = /*@__PURE__*/getDefaultExportFromCjs(reactExports);

const index$1 = /*#__PURE__*/_mergeNamespaces({
	__proto__: null,
	default: index
}, [reactExports]);

export { index$1 as i };
