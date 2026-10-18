/** Original local game images copied from mami12/New-folder. Demo math remains independent. */
import type { GameId } from './casinoEngine';
export interface SpriteArt { src: string; rect?: { x:number;y:number;w:number;h:number;atlasW:number;atlasH:number }; }
export const casinoAssetUrl = (file: string) => import.meta.env.BASE_URL + 'casino-assets/' + file;
export const ORIGINAL_BACKGROUNDS: Record<GameId,string> = {
 aladdin: 'aladdin/background.jpg',
 'big-bass': 'big-bass/background.jpg',
 'book-ra': 'book-ra/background.webp',
 'five-reel': 'five-reel/background.png',
 gates: 'gates/icon.avif',
 'jewels-ra': 'jewels-ra/background.jpg',
 atlantis: 'atlantis/background.jpg',
 sizzling: 'sizzling/background.webp',
 anubis: 'anubis/background.jpg',
};
export const ORIGINAL_LOGOS: Partial<Record<GameId,string>> = {
 'book-ra':'book-ra/logo.png',
 sizzling:'sizzling/logo.png',
 gates:'gates/icon.avif',
};
export const ORIGINAL_SYMBOLS: Partial<Record<GameId,SpriteArt[]>> = {
 aladdin:[{"src":"aladdin/symbols.png","rect":{"x":0,"y":0,"w":167,"h":130,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":165,"y":0,"w":165,"h":151,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":333,"y":0,"w":174,"h":150,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":0,"y":320,"w":212,"h":204,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":434,"y":325,"w":167,"h":187,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":235,"y":617,"w":175,"h":210,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":440,"y":650,"w":207,"h":173,"atlasW":829,"atlasH":833}},{"src":"aladdin/symbols.png","rect":{"x":663,"y":631,"w":164,"h":190,"atlasW":829,"atlasH":833}}],
 'big-bass':[{"src":"big-bass/symbols.png","rect":{"x":570,"y":78,"w":118,"h":177,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":574,"y":283,"w":120,"h":165,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":660,"y":429,"w":176,"h":140,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":1539,"y":1162,"w":205,"h":111,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":1745,"y":1138,"w":180,"h":130,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":941,"y":1138,"w":193,"h":112,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":1365,"y":1000,"w":260,"h":182,"atlasW":2048,"atlasH":2045}},{"src":"big-bass/symbols.png","rect":{"x":973,"y":524,"w":235,"h":185,"atlasW":2048,"atlasH":2045}}],
 sizzling:[{"src":"sizzling/reelset.webp","rect":{"x":1345,"y":1,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset2.webp","rect":{"x":1121,"y":1,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset2.webp","rect":{"x":1,"y":225,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset.webp","rect":{"x":1345,"y":1121,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset.webp","rect":{"x":1345,"y":449,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset.webp","rect":{"x":1121,"y":225,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset.webp","rect":{"x":897,"y":897,"w":222,"h":222,"atlasW":2016,"atlasH":2016}},{"src":"sizzling/reelset.webp","rect":{"x":1,"y":1,"w":222,"h":222,"atlasW":2016,"atlasH":2016}}],
 'book-ra':[{"src":"book-ra/reelset.webp","rect":{"x":3,"y":3,"w":222,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset.webp","rect":{"x":3,"y":687,"w":222,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset.webp","rect":{"x":3,"y":1371,"w":222,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset.webp","rect":{"x":231,"y":231,"w":222,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset.webp","rect":{"x":231,"y":915,"w":222,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset.webp","rect":{"x":1599,"y":459,"w":221,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset.webp","rect":{"x":1826,"y":459,"w":214,"h":222,"atlasW":2043,"atlasH":2048}},{"src":"book-ra/reelset2.webp","rect":{"x":1371,"y":231,"w":222,"h":222,"atlasW":2044,"atlasH":2048}}],
 'five-reel':[{"src":"five-reel/r1.png"},{"src":"five-reel/r3.png"},{"src":"five-reel/r4.png"},{"src":"five-reel/r5.png"},{"src":"five-reel/r6.png"},{"src":"five-reel/r7.png"},{"src":"five-reel/r8.png"},{"src":"five-reel/r9.png"}],
};
