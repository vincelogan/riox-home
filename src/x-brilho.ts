/*
 * RioX Hub · brilho dourado no X da logo
 *
 * Desenha a logo do site num canvas WebGL2 por cima do <img> e simula a luz
 * passando pelo foil do X: as micro-dobras do foil acendem conforme o ângulo da
 * luz, a borda rebaixada ganha um filete e um halo dourado vaza para o papel.
 * Nada do desenho muda: o efeito é só luz sobre a imagem oficial.
 *
 * - Loop automático (mesma coreografia do vídeo: passada principal + reflexo curto)
 * - Desktop: a luz segue o mouse sobre a logo
 * - Celular: um toque na logo dispara um reflexo
 * - Pausa fora da tela e em aba oculta; não roda com redução de movimento
 * - Sem WebGL2 ou se algo falhar, o <img> continua lá, intacto
 *
 * Fonte TypeScript. O site carrega a versão compilada /x-brilho.js:
 *   npx -p typescript tsc src/x-brilho.ts --target es2020 --module es2020 --strict --outDir .
 */

/** Geometria do X dentro de logo.png (gerada junto com x-brilho-mapas.png). */
const GEOMETRIA = {
  logo: [1100, 1086],
  regiao: [601, 462, 383, 385], // x, y, largura, altura em px do logo.png
  centro: [191.5, 192.5], // centro do X dentro da região
  alcance: 204, // meio percurso da luz ao longo da varredura, em px
};

/** Direção da varredura: da esquerda para a direita, levemente descendo. */
const DIRECAO: [number, number] = [Math.cos((28 * Math.PI) / 180), Math.sin((28 * Math.PI) / 180)];

/** Coreografia de um ciclo, em segundos. */
const CICLO = 7.0;
const ATRASO_INICIAL = 0.9;
const PASSADAS = [
  { inicio: 0.8, fim: 3.1, amplitude: 1.0, largura: 33.6 },
  { inicio: 4.5, fim: 5.55, amplitude: 0.7, largura: 18.3 },
];

interface Luz {
  s: number; // posição do centro do feixe ao longo da varredura
  env: number; // intensidade 0..1
  largura: number;
  inclinacao: number; // -1..1, inclina a luz para acender facetas diferentes
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 cor;
uniform sampler2D uLogo;
uniform sampler2D uMapas;
uniform vec2 uLogoPx;
uniform vec4 uRegiao;
uniform vec2 uCentro;
uniform vec2 uDir;
uniform vec3 uPapel;
uniform vec4 uLuz[2];
uniform float uAtivo;

const vec3 LUZ = vec3(1.0, 0.90, 0.58);
const vec3 PICO = vec3(1.0, 0.99, 0.94);
const vec3 HALO = vec3(1.0, 0.82, 0.46);

vec3 tela(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

vec3 base(vec2 uv) {
  vec4 l = texture(uLogo, uv);          // pré-multiplicada
  return l.rgb + uPapel * (1.0 - l.a);  // logo sobre a cor do papel da página
}

// diferença de cor que a luz provoca neste ponto (zero onde não há luz)
vec3 efeito(vec2 uv) {
  vec2 rp = uv * uLogoPx - uRegiao.xy;
  if (rp.x < 0.0 || rp.y < 0.0 || rp.x > uRegiao.z || rp.y > uRegiao.w) return vec3(0.0);
  vec3 b = base(uv);
  vec2 meio = vec2(0.5) / uRegiao.zw;
  vec2 ruv = clamp(rp / uRegiao.zw, meio, vec2(1.0) - meio);
  vec3 A = texture(uMapas, vec2(ruv.x / 3.0, ruv.y)).rgb;
  vec3 B = texture(uMapas, vec2((ruv.x + 1.0) / 3.0, ruv.y)).rgb;
  vec3 C = texture(uMapas, vec2((ruv.x + 2.0) / 3.0, ruv.y)).rgb;

  float M = A.r;
  vec2 nxy = A.gb * 2.0 - 1.0;
  vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  float T = B.r;
  float borda = B.g;
  float ang = (B.b - 0.5) * 6.2831853;
  vec2 en = vec2(cos(ang), sin(ang));
  float S = dot(rp - uCentro, uDir);

  float hl = 0.0, sf = 0.0, envs = 0.0, nucleos = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 L = uLuz[i];
    if (L.y < 0.0005) continue;
    float d = S - L.x;
    float nucleo = exp(-(d / L.z) * (d / L.z)) * L.y;
    float suave = exp(-(d / (L.z * 2.3)) * (d / (L.z * 2.3))) * L.y;
    vec3 h = normalize(vec3(0.55 * L.w * uDir.x, 0.55 * L.w * uDir.y - 0.18, 2.0));
    float faceta = pow(max(dot(n, h), 0.0), 160.0);
    float espec = nucleo * (0.12 + 3.1 * faceta + 0.75 * T * nucleo);
    float aro = borda * clamp(-dot(en, uDir), 0.0, 1.0) * max(nucleo, suave * 0.5) * 1.6;
    hl += espec + aro;
    sf += suave;
    envs = max(envs, L.y);
    nucleos += nucleo;
  }
  hl = clamp(hl, 0.0, 1.2) * M;
  float lf = clamp(sf, 0.0, 1.0) * M;

  // ouro acende mantendo o matiz; fora do feixe o foil escurece de leve
  vec3 ouro = 1.0 - pow(max(1.0 - b, 0.0), vec3(1.0 + 0.62 * lf));
  float lum = dot(ouro, vec3(0.299, 0.587, 0.114));
  ouro = lum + (ouro - lum) * (1.0 + 0.95 * lf);
  ouro *= 1.0 - 0.22 * envs * (1.0 - lf);
  ouro = clamp(ouro, 0.0, 1.0);
  ouro = tela(ouro, clamp(hl, 0.0, 1.0) * LUZ);
  ouro = tela(ouro, clamp((hl - 0.85) * 2.2, 0.0, 1.0) * PICO * 0.55);
  vec3 c = mix(b, ouro, M);
  float brilho = nucleos * 0.55 * (0.62 * C.r + 0.34 * C.g);
  c = tela(c, clamp(brilho, 0.0, 1.0) * HALO);
  return c - b;
}

void main() {
  vec2 dx = dFdx(vUv) * 0.25;
  vec2 dy = dFdy(vUv) * 0.25;
  vec3 c = base(vUv);
  if (uAtivo > 0.5) {
    vec3 d = efeito(vUv - dx - dy * 0.5) + efeito(vUv + dx * 0.5 - dy)
           + efeito(vUv + dx + dy * 0.5) + efeito(vUv - dx * 0.5 + dy);
    c = clamp(c + d * 0.25, 0.0, 1.0);
  }
  cor = vec4(c, 1.0);
}`;

function suaveEntraSai(u: number): number {
  const x = Math.min(Math.max(u, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function corDoPapel(): [number, number, number] {
  const valor = getComputedStyle(document.documentElement).getPropertyValue('--papel').trim() || '#DCDED0';
  const hex = valor.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
  if (Number.isNaN(n)) return [220 / 255, 222 / 255, 208 / 255];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.decoding = 'async';
  im.src = src;
  return im.decode().then(() => im);
}

class BrilhoX {
  private readonly canvas: HTMLCanvasElement;
  private readonly moldura: HTMLElement;
  private gl!: WebGL2RenderingContext;
  private programa!: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private inicio = performance.now();
  private quadro = 0;
  private visivel = true;
  private parado = false;
  private ocioso = false;
  private desenhou = false;
  // luz guiada pelo mouse
  private sobre = false;
  private alvoS = 0;
  private atualS = 0;
  private envMouse = 0;
  private ultimo = performance.now();

  constructor(private readonly img: HTMLImageElement) {
    this.moldura = img.parentElement as HTMLElement;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'logo-brilho';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  async iniciar(): Promise<void> {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;
    this.gl = gl;
    const mapasUrl = new URL('x-brilho-mapas.png', import.meta.url).href;
    const [logo, mapas] = await Promise.all([
      this.img.complete && this.img.naturalWidth ? this.img.decode().then(() => this.img) : carregarImagem(this.img.currentSrc || this.img.src),
      carregarImagem(mapasUrl),
    ]);
    if (!this.montar(logo, mapas)) return;
    this.moldura.appendChild(this.canvas);
    this.ouvir();
    this.redimensionar();
    this.agendar();
  }

  private compilar(tipo: number, fonte: string): WebGLShader | null {
    const gl = this.gl;
    const s = gl.createShader(tipo);
    if (!s) return null;
    gl.shaderSource(s, fonte);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[brilho-x]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  private textura(unidade: number, imagem: HTMLImageElement, opcoes: { premultiplicar: boolean; mipmap: boolean; cru: boolean }): void {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, opcoes.premultiplicar);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, opcoes.cru ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (opcoes.mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  private montar(logo: HTMLImageElement, mapas: HTMLImageElement): boolean {
    const gl = this.gl;
    const vs = this.compilar(gl.VERTEX_SHADER, VERT);
    const fs = this.compilar(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const p = gl.createProgram();
    if (!p) return false;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[brilho-x]', gl.getProgramInfoLog(p));
      return false;
    }
    this.programa = p;
    gl.useProgram(p);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.textura(0, logo, { premultiplicar: true, mipmap: true, cru: false });
    this.textura(1, mapas, { premultiplicar: false, mipmap: false, cru: true });

    for (const nome of ['uLogo', 'uMapas', 'uLogoPx', 'uRegiao', 'uCentro', 'uDir', 'uPapel', 'uLuz', 'uAtivo']) {
      this.u[nome] = gl.getUniformLocation(p, nome);
    }
    gl.uniform1i(this.u.uLogo, 0);
    gl.uniform1i(this.u.uMapas, 1);
    gl.uniform2f(this.u.uLogoPx, GEOMETRIA.logo[0], GEOMETRIA.logo[1]);
    gl.uniform4f(this.u.uRegiao, GEOMETRIA.regiao[0], GEOMETRIA.regiao[1], GEOMETRIA.regiao[2], GEOMETRIA.regiao[3]);
    gl.uniform2f(this.u.uCentro, GEOMETRIA.centro[0], GEOMETRIA.centro[1]);
    gl.uniform2f(this.u.uDir, DIRECAO[0], DIRECAO[1]);
    const papel = corDoPapel();
    gl.uniform3f(this.u.uPapel, papel[0], papel[1], papel[2]);
    return true;
  }

  private ouvir(): void {
    const io = new IntersectionObserver((entradas) => {
      this.visivel = entradas.some((e) => e.isIntersecting);
      this.agendar();
    });
    io.observe(this.moldura);
    document.addEventListener('visibilitychange', () => this.agendar());
    new ResizeObserver(() => this.redimensionar()).observe(this.canvas);

    this.moldura.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.sobre = true;
      this.alvoS = this.posicaoNaVarredura(e.clientX, e.clientY);
      this.agendar();
    });
    this.moldura.addEventListener('pointerleave', () => {
      this.sobre = false;
    });
    this.moldura.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.dispararReflexo();
    });

    this.canvas.addEventListener('webglcontextlost', () => {
      this.parado = true;
      this.canvas.remove();
    });
  }

  private posicaoNaVarredura(cx: number, cy: number): number {
    const r = this.moldura.getBoundingClientRect();
    const px = ((cx - r.left) / r.width) * GEOMETRIA.logo[0] - GEOMETRIA.regiao[0] - GEOMETRIA.centro[0];
    const py = ((cy - r.top) / r.height) * GEOMETRIA.logo[1] - GEOMETRIA.regiao[1] - GEOMETRIA.centro[1];
    const s = px * DIRECAO[0] + py * DIRECAO[1];
    const lim = GEOMETRIA.alcance * 1.15;
    return Math.min(Math.max(s, -lim), lim);
  }

  /** Toque no celular: começa uma passada principal agora, se nenhuma estiver rodando. */
  private dispararReflexo(): void {
    const t = this.tempoNoCiclo(performance.now());
    if (t >= PASSADAS[0].inicio && t <= PASSADAS[0].fim) return;
    this.inicio = performance.now() - (ATRASO_INICIAL + PASSADAS[0].inicio - 0.05) * 1000;
    this.agendar();
  }

  private tempoNoCiclo(agora: number): number {
    const t = (agora - this.inicio) / 1000 - ATRASO_INICIAL;
    if (t < 0) return -1;
    return t % CICLO;
  }

  private redimensionar(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.ocioso = false;
      this.agendar();
    }
  }

  private agendar(): void {
    if (this.parado || this.quadro || !this.visivel || document.hidden) return;
    this.quadro = requestAnimationFrame((agora) => this.passo(agora));
  }

  private luzes(agora: number): Luz[] {
    const dt = Math.min((agora - this.ultimo) / 1000, 0.1);
    this.ultimo = agora;
    // mouse: a luz acompanha com um leve atraso e acende/apaga com suavidade
    this.envMouse += ((this.sobre ? 1 : 0) - this.envMouse) * (1 - Math.exp(-dt * (this.sobre ? 5 : 3)));
    this.atualS += (this.alvoS - this.atualS) * (1 - Math.exp(-dt * 10));
    const automatico = 1 - this.envMouse;

    const luzes: Luz[] = [];
    const t = this.tempoNoCiclo(agora);
    for (const p of PASSADAS) {
      if (t < p.inicio - 0.05 || t > p.fim + 0.05) {
        luzes.push({ s: 0, env: 0, largura: p.largura, inclinacao: 0 });
        continue;
      }
      const u = (t - p.inicio) / (p.fim - p.inicio);
      const s = -GEOMETRIA.alcance + 2 * GEOMETRIA.alcance * suaveEntraSai(u);
      const env = Math.pow(Math.sin(Math.PI * Math.min(Math.max(u, 0), 1)), 0.9) * p.amplitude * automatico;
      luzes.push({ s, env, largura: p.largura, inclinacao: s / GEOMETRIA.alcance });
    }
    // a luz do mouse ocupa a vaga da passada que estiver apagada
    if (this.envMouse > 0.001) {
      const vaga = luzes[0].env <= luzes[1].env ? 0 : 1;
      luzes[vaga] = { s: this.atualS, env: this.envMouse, largura: 33.6, inclinacao: this.atualS / GEOMETRIA.alcance };
    }
    return luzes;
  }

  private passo(agora: number): void {
    this.quadro = 0;
    const luzes = this.luzes(agora);
    const ativo = luzes.some((l) => l.env > 0.0005);
    if (ativo || !this.ocioso || !this.desenhou) {
      this.desenhar(luzes, ativo);
      this.ocioso = !ativo;
    }
    this.agendar();
  }

  private desenhar(luzes: Luz[], ativo: boolean): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.programa);
    const dados = new Float32Array(8);
    luzes.slice(0, 2).forEach((l, i) => dados.set([l.s, l.env, l.largura, l.inclinacao], i * 4));
    gl.uniform4fv(this.u.uLuz, dados);
    gl.uniform1f(this.u.uAtivo, ativo ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!this.desenhou) {
      this.desenhou = true;
      this.canvas.classList.add('pronto');
    }
  }
}

function iniciarBrilhoX(): void {
  const img = document.querySelector<HTMLImageElement>('img[data-brilho-x]');
  if (!img || !img.parentElement) return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  new BrilhoX(img).iniciar().catch((erro) => console.warn('[brilho-x]', erro));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarBrilhoX, { once: true });
} else {
  iniciarBrilhoX();
}

export {};
