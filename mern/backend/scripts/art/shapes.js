/**
 * Vector illustrations, one per seeded item.
 *
 * Each entry returns inner SVG markup (no <svg> wrapper) drawn on the shared
 * 800x600 canvas. `c` is the item's primary colour and `a` its secondary, so the
 * artwork reflects the real itemProfile instead of reusing one generic picture.
 *
 * Hand-built geometry on purpose: it stays offline, commits no binary assets,
 * and scales cleanly at any size.
 */
const { shade, highlight, detail } = require('./palette');

const SHAPES = {
  backpack: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M262 214c0-52 42-94 94-94h84c52 0 94 42 94 94v250c0 26-22 48-48 48H310c-26 0-48-22-48-48z" fill="url(#body)"/>
      <path d="M356 120c0-34 20-58 44-58s44 24 44 58" fill="none" stroke="${detail(c)}" stroke-width="18" stroke-linecap="round"/>
      <rect x="300" y="300" width="196" height="104" rx="20" fill="${shade(c, -0.28)}"/>
      <path d="M300 352h196" stroke="${highlight(c)}" stroke-width="5" opacity="0.5"/>
      <circle cx="398" cy="330" r="9" fill="${a}" opacity="0.9"/>
      <path d="M262 250h-26c-16 0-28 13-28 29v74c0 16 12 29 28 29h26z" fill="${shade(c, -0.16)}"/>
      <path d="M534 250h26c16 0 28 13 28 29v74c0 16-12 29-28 29h-26z" fill="${shade(c, -0.16)}"/>
    </g>
    <path d="M300 250c0-30 24-54 54-54h88c30 0 54 24 54 54v40H300z" fill="#ffffff" opacity="0.1"/>`,

  bottle: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="360" y="96" width="80" height="60" rx="14" fill="${shade(c, -0.3)}"/>
      <path d="M352 150h96c26 0 46 20 46 46v246c0 30-24 54-54 54h-80c-30 0-54-24-54-54V196c0-26 20-46 46-46z" fill="url(#body)"/>
      <rect x="318" y="262" width="164" height="34" rx="10" fill="${a}" opacity="0.85"/>
      <path d="M344 400h112" stroke="${shade(c, -0.35)}" stroke-width="6" opacity="0.4" stroke-linecap="round"/>
    </g>
    <ellipse cx="346" cy="240" rx="15" ry="72" fill="#ffffff" opacity="0.22"/>`,

  laptop: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M244 168h312c18 0 32 14 32 32v208H212V200c0-18 14-32 32-32z" fill="${c}"/>
      <path d="M240 196h320v184H240z" fill="${shade(c, -0.34)}"/>
      <path d="M262 218h276v140H262z" fill="${a}" opacity="0.75"/>
      <path d="M186 408h428l26 52c4 9-3 18-13 18H173c-10 0-17-9-13-18z" fill="${shade(c, -0.18)}"/>
      <rect x="356" y="424" width="88" height="10" rx="5" fill="${shade(c, -0.4)}" opacity="0.6"/>
    </g>
    <path d="M262 218h276v140H262z" fill="#ffffff" opacity="0.12"/>`,

  umbrella: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M400 132c-118 0-206 76-224 174h448c-18-98-106-174-224-174z" fill="url(#body)"/>
      <path d="M400 132c-52 0-96 68-108 174h216c-12-106-56-174-108-174z" fill="${a}" opacity="0.55"/>
      <path d="M176 306h448" stroke="${shade(c, -0.4)}" stroke-width="7"/>
      <rect x="388" y="306" width="24" height="152" rx="10" fill="${shade(c, -0.3)}"/>
      <path d="M412 458c0 34-26 48-48 40" fill="none" stroke="${a}" stroke-width="16" stroke-linecap="round"/>
    </g>
    <path d="M400 132c-118 0-206 76-224 174h224z" fill="#ffffff" opacity="0.13"/>`,

  keyboard: (c, a, d) => {
    // Built with .map() + string concatenation, not a nested template literal:
    // a backtick inside a template literal would terminate the outer string.
    const keys = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 14 }, (_, col) =>
        '<rect x="' + (186 + col * 32) + '" y="' + (264 + r * 28) +
        '" width="24" height="20" rx="5" fill="' +
        (r === 0 && col === 3 ? a : shade(c, -0.55)) + '"/>'
      ).join('')
    ).join('');
    return `
    <g filter="url(#sh)">
      <rect x="150" y="238" width="500" height="180" rx="22" fill="url(#body)"/>
      <g>${keys}</g>
    </g>
    <rect x="150" y="238" width="500" height="34" rx="16" fill="#ffffff" opacity="0.14"/>`;
  },
  badge: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="304" y="196" width="192" height="252" rx="20" fill="${a}"/>
      <rect x="322" y="216" width="156" height="212" rx="12" fill="#ffffff" opacity="0.92"/>
      <circle cx="400" cy="278" r="42" fill="${c}" opacity="0.85"/>
      <path d="M378 278l16 16 30-32" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="344" y="344" width="112" height="12" rx="6" fill="#94a3b8"/>
      <rect x="362" y="372" width="76" height="10" rx="5" fill="#cbd5e1"/>
    </g>
    <rect x="304" y="196" width="192" height="44" rx="20" fill="#ffffff" opacity="0.25"/>`,

  wallet: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M250 244c0-22 18-40 40-40h180c22 0 40 18 40 40v192c0 22-18 40-40 40H290c-22 0-40-18-40-40z" fill="url(#body)"/>
      <path d="M470 300h40c14 0 24 11 24 25v46c0 14-10 25-24 25h-40z" fill="${shade(c, -0.26)}"/>
      <path d="M250 300h220" stroke="${shade(c, -0.4)}" stroke-width="4" opacity="0.5"/>
      <path d="M300 300c0-32 26-58 58-58h54" fill="none" stroke="${shade(c, -0.45)}" stroke-width="7" opacity="0.55" stroke-dasharray="12 10"/>
    </g>
    <path d="M268 226h180c16 0 28 12 28 28v20H240v-20c0-16 12-28 28-28z" fill="#ffffff" opacity="0.12"/>`,

  keys: (c, a, d) => `
    <g filter="url(#sh)">
      <circle cx="330" cy="286" r="76" fill="none" stroke="${a}" stroke-width="20"/>
      <rect x="366" y="272" width="204" height="28" rx="14" fill="${c}"/>
      <rect x="510" y="272" width="26" height="66" rx="10" fill="${c}"/>
      <rect x="556" y="272" width="26" height="52" rx="10" fill="${c}"/>
      <path d="M430 300v34" stroke="${c}" stroke-width="22" stroke-linecap="round"/>
      <path d="M476 300v30" stroke="${c}" stroke-width="22" stroke-linecap="round"/>
    </g>
    <rect x="366" y="272" width="204" height="10" rx="5" fill="#ffffff" opacity="0.28"/>`,

  glasses: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="188" y="248" width="180" height="132" rx="44" fill="${c}" opacity="0.26"/>
      <rect x="432" y="248" width="180" height="132" rx="44" fill="${c}" opacity="0.26"/>
      <rect x="188" y="248" width="180" height="132" rx="44" fill="none" stroke="${c}" stroke-width="14"/>
      <rect x="432" y="248" width="180" height="132" rx="44" fill="none" stroke="${c}" stroke-width="14"/>
      <path d="M368 296h64" stroke="${c}" stroke-width="14" stroke-linecap="round"/>
      <path d="M188 288l-72-34" stroke="${c}" stroke-width="14" stroke-linecap="round"/>
      <path d="M612 288l72-34" stroke="${c}" stroke-width="14" stroke-linecap="round"/>
    </g>
    <path d="M212 268h132l-96 92h-36z" fill="#ffffff" opacity="0.3"/>
    <path d="M456 268h132l-96 92h-36z" fill="#ffffff" opacity="0.3"/>`,

  notebook: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="268" y="132" width="264" height="336" rx="16" fill="url(#body)"/>
      <rect x="268" y="132" width="52" height="336" rx="16" fill="${shade(c, -0.3)}"/>
      <g fill="${a}">
        ${Array.from({ length: 6 }, (_, i) => `<circle cx="294" cy="${196 + i * 46}" r="11"/>`).join('')}
      </g>
      <g stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity="0.5">
        <path d="M356 212h140"/><path d="M356 264h140"/><path d="M356 316h108"/>
      </g>
      <rect x="356" y="380" width="60" height="60" rx="10" fill="${a}" opacity="0.5"/>
    </g>
    <rect x="330" y="132" width="24" height="336" fill="#ffffff" opacity="0.08"/>`,

  phone: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="316" y="128" width="168" height="344" rx="34" fill="${a}" opacity="0.55"/>
      <rect x="328" y="140" width="144" height="320" rx="26" fill="url(#body)"/>
      <rect x="368" y="152" width="64" height="10" rx="5" fill="${shade(c, -0.5)}" opacity="0.7"/>
      <circle cx="400" cy="256" r="42" fill="#ffffff" opacity="0.22"/>
      <rect x="352" y="330" width="96" height="12" rx="6" fill="#ffffff" opacity="0.45"/>
      <rect x="368" y="358" width="64" height="10" rx="5" fill="#ffffff" opacity="0.3"/>
    </g>
    <path d="M340 150l-4 300" stroke="#ffffff" stroke-width="12" opacity="0.25" stroke-linecap="round"/>`,

  charger: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="292" y="216" width="216" height="188" rx="40" fill="url(#body)"/>
      <rect x="292" y="216" width="216" height="60" rx="30" fill="#ffffff" opacity="0.14"/>
      <rect x="356" y="120" width="30" height="110" rx="14" fill="${c}"/>
      <rect x="404" y="120" width="30" height="110" rx="14" fill="${c}"/>
      <path d="M400 316c-30 0-54 24-54 54v34h108v-34c0-30-24-54-54-54z" fill="${a}" opacity="0.65"/>
      <circle cx="400" cy="452" r="15" fill="#ffffff" opacity="0.5"/>
    </g>
    <rect x="356" y="120" width="30" height="110" rx="14" fill="#ffffff" opacity="0.15"/>`,

  shoe: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M170 400c0-26 20-46 46-48l84-8 62-96c10-16 28-26 46-26h44c26 0 48 18 52 44l10 62c22 8 40 28 42 52 2 24-16 44-40 44H212c-24 0-42-12-42-24z" fill="url(#body)"/>
      <path d="M170 400h338c24 0 42 12 42 26 0 12-10 20-24 20H204c-20 0-34-8-34-20z" fill="#ffffff"/>
      <path d="M300 344l58-92c10-16 28-26 46-26h44c26 0 48 18 52 44l6 40z" fill="${a}" opacity="0.4"/>
      <g stroke="${shade(c, -0.45)}" stroke-width="9" stroke-linecap="round">
        <path d="M338 316h88"/><path d="M356 282h88"/><path d="M382 250h80"/>
      </g>
    </g>`,

  glassescase: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="212" y="248" width="376" height="176" rx="52" fill="url(#body)"/>
      <path d="M212 336h376" stroke="${shade(c, -0.35)}" stroke-width="6" opacity="0.55"/>
      <circle cx="400" cy="300" r="15" fill="${a}"/>
      <path d="M212 300a52 52 0 0 1 52-52h272a52 52 0 0 1 52 52v36H212z" fill="#ffffff" opacity="0.13"/>
      <rect x="262" y="356" width="120" height="10" rx="5" fill="#ffffff" opacity="0.3"/>
    </g>`,

  stickers: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="252" y="196" width="296" height="212" rx="18" fill="url(#body)"/>
      <rect x="252" y="196" width="296" height="212" rx="18" fill="none" stroke="${a}" stroke-width="9"/>
      <circle cx="352" cy="302" r="56" fill="${a}"/>
      <path d="M328 302l18 18 34-38" stroke="#ffffff" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M436 262h84M436 306h84M436 350h60" stroke="#ffffff" stroke-width="11" stroke-linecap="round" opacity="0.65"/>
    </g>
    <rect x="252" y="196" width="296" height="34" rx="16" fill="#ffffff" opacity="0.12"/>`,

  headphone: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M228 336v-24c0-96 76-172 172-172s172 76 172 172v24" fill="none" stroke="${c}" stroke-width="46" stroke-linecap="round"/>
      <rect x="176" y="312" width="104" height="152" rx="46" fill="${shade(c, -0.28)}"/>
      <rect x="520" y="312" width="104" height="152" rx="46" fill="${shade(c, -0.28)}"/>
      <rect x="196" y="336" width="64" height="104" rx="30" fill="${a}" opacity="0.6"/>
      <rect x="540" y="336" width="64" height="104" rx="30" fill="${a}" opacity="0.6"/>
    </g>`,

  book: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="248" y="164" width="304" height="272" rx="14" fill="url(#body)"/>
      <rect x="248" y="164" width="46" height="272" rx="14" fill="${shade(c, -0.32)}"/>
      <rect x="330" y="212" width="176" height="18" rx="9" fill="#ffffff" opacity="0.5"/>
      <rect x="330" y="252" width="130" height="14" rx="7" fill="#ffffff" opacity="0.35"/>
      <rect x="330" y="286" width="152" height="14" rx="7" fill="#ffffff" opacity="0.35"/>
      <rect x="286" y="196" width="8" height="208" rx="4" fill="${a}"/>
    </g>
    <rect x="248" y="164" width="304" height="40" rx="14" fill="#ffffff" opacity="0.1"/>`,

  handbag: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M250 268c0-22 18-40 40-40h220c22 0 40 18 40 40v184c0 22-18 40-40 40H290c-22 0-40-18-40-40z" fill="url(#body)"/>
      <path d="M330 228c0-60 30-96 70-96s70 36 70 96" fill="none" stroke="${d}" stroke-width="20" stroke-linecap="round"/>
      <rect x="278" y="330" width="244" height="26" rx="13" fill="${a}" opacity="0.75"/>
      <circle cx="400" cy="404" r="17" fill="${a}"/>
      <path d="M400 404v22" stroke="${a}" stroke-width="9" stroke-linecap="round"/>
    </g>
    <path d="M250 268c0-22 18-40 40-40h220c22 0 40 18 40 40v40H250z" fill="#ffffff" opacity="0.12"/>`,

  tablet: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="228" y="150" width="344" height="300" rx="34" fill="${shade(c, -0.3)}"/>
      <rect x="252" y="176" width="296" height="248" rx="20" fill="${a}"/>
      <path d="M300 250h200M300 292h200M300 334h120" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.55"/>
      <circle cx="400" cy="440" r="9" fill="#ffffff" opacity="0.45"/>
    </g>
    <rect x="252" y="176" width="296" height="248" rx="20" fill="#ffffff" opacity="0.09"/>`,

  watch: (c, a, d) => `
    <g filter="url(#sh)">
      <rect x="352" y="120" width="96" height="150" rx="30" fill="${d}"/>
      <rect x="352" y="330" width="96" height="150" rx="30" fill="${d}"/>
      <circle cx="400" cy="300" r="118" fill="url(#body)"/>
      <circle cx="400" cy="300" r="94" fill="${shade(c, -0.35)}"/>
      <path d="M400 300l58-40" stroke="${a}" stroke-width="12" stroke-linecap="round"/>
      <path d="M400 300v-58" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.75"/>
      <circle cx="400" cy="300" r="9" fill="#ffffff"/>
      <circle cx="400" cy="156" r="13" fill="${a}"/>
    </g>
    <ellipse cx="352" cy="240" rx="16" ry="60" fill="#ffffff" opacity="0.16"/>`,

  mug: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M498 232h42c30 0 54 24 54 54v34c0 30-24 54-54 54h-42z" fill="none" stroke="${d}" stroke-width="26"/>
      <path d="M258 212h250c18 0 32 14 32 32v186c0 34-28 62-62 62H288c-34 0-62-28-62-62V244c0-18 14-32 32-32z" fill="url(#body)"/>
      <ellipse cx="383" cy="212" rx="125" ry="26" fill="${shade(c, 0.25)}"/>
      <ellipse cx="383" cy="212" rx="96" ry="16" fill="${a}" opacity="0.7"/>
      <path d="M300 320h166" stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.35"/>
    </g>
    <path d="M268 300v120c0 20 16 36 36 36h-16c-34 0-62-28-62-62V244c0-18 14-32 32-32h10z" fill="#ffffff" opacity="0.12"/>`,

  trousers: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M292 150h216v104l-26 226c-2 22-20 38-42 38h-40c-24 0-42-18-42-40l-6-192-6 192c0 22-18 40-42 40h-40c-22 0-40-16-42-38L200 254V150z" fill="url(#body)"/>
      <rect x="292" y="150" width="216" height="34" rx="12" fill="${shade(c, -0.3)}"/>
      <path d="M400 184v96" stroke="${shade(c, -0.3)}" stroke-width="7" opacity="0.6"/>
      <rect x="342" y="200" width="116" height="16" rx="8" fill="${a}" opacity="0.8"/>
      <path d="M288 392h68M444 392h68" stroke="${a}" stroke-width="12" stroke-linecap="round" opacity="0.85"/>
      <rect x="232" y="330" width="56" height="76" rx="12" fill="${shade(c, -0.16)}"/>
      <rect x="512" y="330" width="56" height="76" rx="12" fill="${shade(c, -0.16)}"/>
    </g>`,

  laptopstand: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M212 402h376v30c0 20-16 36-36 36H248c-20 0-36-16-36-36z" fill="${shade(c, -0.3)}"/>
      <path d="M262 402l96-236c8-20 26-32 47-32h40c21 0 39 12 47 32l96 236z" fill="url(#body)"/>
      <path d="M292 372l82-200c4-10 13-16 24-16h4c11 0 20 6 24 16l82 200z" fill="${shade(c, -0.34)}"/>
      <path d="M312 350h176" stroke="${a}" stroke-width="18" stroke-linecap="round"/>
      <path d="M340 288h120" stroke="${a}" stroke-width="12" stroke-linecap="round" opacity="0.7"/>
    </g>
    <path d="M262 402l96-236c8-20 26-32 47-32h8c-21 0-39 12-47 32l-96 236z" fill="#ffffff" opacity="0.14"/>`,

  mouse: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M400 140c66 0 118 52 118 118v128c0 66-52 118-118 118s-118-52-118-118V258c0-66 52-118 118-118z" fill="url(#body)"/>
      <path d="M400 140c-66 0-118 52-118 118v40h236v-40c0-66-52-118-118-118z" fill="${shade(c, -0.22)}"/>
      <rect x="386" y="168" width="28" height="76" rx="14" fill="${a}"/>
      <path d="M282 300h236" stroke="${shade(c, -0.35)}" stroke-width="6" opacity="0.5"/>
    </g>
    <ellipse cx="352" cy="330" rx="22" ry="80" fill="#ffffff" opacity="0.14"/>`,

  spectacles: (c, a, d) => `
    <g filter="url(#sh)">
      <path d="M212 268h376" stroke="${shade(c, -0.35)}" stroke-width="14" stroke-linecap="round"/>
      <circle cx="308" cy="322" r="80" fill="none" stroke="url(#body)" stroke-width="22"/>
      <circle cx="492" cy="322" r="80" fill="none" stroke="url(#body)" stroke-width="22"/>
      <path d="M228 322c-24 0-40 20-40 48" fill="none" stroke="${shade(c, -0.35)}" stroke-width="14" stroke-linecap="round"/>
      <path d="M572 322c24 0 40 20 40 48" fill="none" stroke="${shade(c, -0.35)}" stroke-width="14" stroke-linecap="round"/>
      <circle cx="308" cy="322" r="66" fill="${a}" opacity="0.32"/>
      <circle cx="492" cy="322" r="66" fill="${a}" opacity="0.32"/>
    </g>`
};

/** Fallback for a category we have not drawn: a neutral parcel. */
const GENERIC = (c) => `
  <g filter="url(#sh)">
    <path d="M400 148l204 92v220l-204 92-204-92V240z" fill="url(#body)"/>
    <path d="M196 240l204 92 204-92" fill="none" stroke="${shade(c, -0.35)}" stroke-width="7"/>
    <path d="M400 332v220" stroke="${shade(c, -0.35)}" stroke-width="7"/>
  </g>`;

module.exports = { SHAPES, GENERIC };
