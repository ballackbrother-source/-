/**
 * scenes/ShopScene.js
 * @layer presentation(scene)
 * どうぐ屋：かう／うる の2モード。アイコン・価格・所持数・所持金つき。
 * イベントの `shop` コマンドから { items:[id...], title } を受け取って開く。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';

function wrapText(r, text, x, y, w, size) {
  const perLine = Math.floor(w / (size * 0.95));
  for (let i = 0, line = 0; i < text.length; i += perLine, line++) {
    r.text(text.slice(i, i + perLine), x, y + line * (size + 4), { size, color: '#cfe' });
  }
}

export class ShopScene extends Scene {
  constructor(game, config = {}) {
    super(game);
    this.opaque = false;
    this.itemIds = config.items || [];
    this.title = config.title || 'どうぐ屋';
    this.mode = 'buy';
    this.toast = ''; this.toastT = 0;
  }

  onEnter() { this._build(); }

  _build() {
    if (this.mode === 'buy') {
      this.menu = new CommandWindow(this.itemIds.map((id) => this._buyRow(id)), { lineH: 30 });
    } else {
      this.sellList = this.game.inventory.list().filter((e) => e.item && e.item.price && e.item.type !== 'key');
      const items = this.sellList.length
        ? this.sellList.map((e) => this._sellRow(e))
        : [{ label: '売れる物が ない', value: null, disabled: true }];
      this.menu = new CommandWindow(items, { lineH: 30 });
    }
  }

  _buyRow(id) {
    const it = this.game.db.getItem(id);
    const price = it?.price ?? 0;
    return { value: id, label: it ? it.name : id, sub: `${price}G`, icon: it?.type || 'item', disabled: this.game.party.gold < price };
  }
  _sellRow(e) {
    const price = Math.floor((e.item.price || 0) * 0.5);
    return { value: e.id, label: e.item.name, sub: `+${price}G ×${e.count}`, icon: e.item.type || 'item' };
  }

  setToast(t) { this.toast = t; this.toastT = 120; }

  update() {
    const a = this.game.audio, input = this.game.input;
    if (this.toastT > 0) this.toastT--;
    if (input.isPressed('left') || input.isPressed('right')) { this.mode = this.mode === 'buy' ? 'sell' : 'buy'; a.se('cursor'); this._build(); }
    const res = this.menu.update(input, a);
    if (res === 'cancel') { a.se('cancel'); this.game.scenes.pop(); return; }
    if (res === 'confirm') { if (this.mode === 'buy') this._buy(a); else this._sell(a); }
  }

  _buy(a) {
    const id = this.menu.current?.value; if (!id) return;
    const it = this.game.db.getItem(id); const price = it?.price ?? 0;
    if (this.game.party.gold < price) { a.se('cancel'); this.setToast('お金が たりないようだ。'); return; }
    this.game.party.gainGold(-price);
    this.game.inventory.add(id, 1);
    a.se('confirm');
    this.setToast(`${it.name} を 買った！`);
    this.menu.items = this.itemIds.map((id2) => this._buyRow(id2));
  }
  _sell(a) {
    const id = this.menu.current?.value; if (!id) return;
    const it = this.game.db.getItem(id); const price = Math.floor((it?.price || 0) * 0.5);
    this.game.party.gainGold(price);
    this.game.inventory.remove(id, 1);
    a.se('confirm');
    this.setToast(`${it.name} を 売った！ (+${price}G)`);
    const i = this.menu.index; this._build(); this.menu.index = Math.max(0, Math.min(i, this.menu.items.length - 1));
  }

  render(r) {
    r.rect(0, 0, VIEW_W, VIEW_H, 'rgba(4,6,16,0.72)');
    const x = 120, y = 40, w = 400, h = 392;
    r.window(x, y, w, h);
    r.text(this.title, x + 18, y + 14, { size: 20, color: COLORS.selected });
    // 所持金（右上・コインアイコン）
    this.game.assets.drawIcon(r.ctx, x + w - 96, y + 24, 7, 'material');
    r.text(`${this.game.party.gold} G`, x + w - 84, y + 16, { size: 18, color: '#ffd23f' });
    // かう／うる タブ
    r.text('かう', x + 150, y + 18, { size: 15, color: this.mode === 'buy' ? COLORS.selected : COLORS.textDim });
    r.text('／', x + 188, y + 18, { size: 15, color: COLORS.textDim });
    r.text('うる', x + 206, y + 18, { size: 15, color: this.mode === 'sell' ? COLORS.selected : COLORS.textDim });

    // リスト（アイコン＋名前＋価格）
    this.menu.render(r, x + 20, y + 56, w - 40, this.game.assets);

    // 選択中の説明＋所持数
    const cur = this.menu.current;
    if (cur && cur.value) {
      const it = this.game.db.getItem(cur.value);
      const by = y + h - 92;
      r.rect(x + 14, by - 6, w - 28, 1, 'rgba(174,224,255,0.25)');
      r.text(it ? it.name : cur.value, x + 20, by, { size: 15, color: COLORS.selected });
      r.text(`持っている数：${this.game.inventory.count(cur.value)}`, x + w - 170, by, { size: 13, color: COLORS.textDim });
      if (it?.desc) wrapText(r, it.desc, x + 20, by + 22, w - 40, 16);
    }

    // トースト
    if (this.toastT > 0) {
      r.window(x + w / 2 - 130, y - 6, 260, 32);
      r.text(this.toast, x + w / 2, y + 2, { size: 14, align: 'center', color: COLORS.text });
    }
    r.text('←→:かう/うる  Z:決定  X:とじる', x + 20, y + h - 26, { size: 12, color: COLORS.textDim });
  }
}
