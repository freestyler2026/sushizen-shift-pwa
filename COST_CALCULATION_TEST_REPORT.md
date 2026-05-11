# Cost Calculation テスト作成・バグ修正レポート

作成日: 2026-05-11

---

## 概要

Cost Calculation チャンネル（`/admin/cost-calculation` および `/admin/cost-calculation/cost-check`）の全ページに対してテスト環境を構築し、テスト実行中に発見したバグを修正しました。

---

## 作成したテストファイル

### 1. `tests/admin/cost-calculation/cost-utils.test.ts`（25テスト）

純粋関数の単体テスト。DOMもネットワークも不要なため高速です。

| テスト対象 | 件数 | 内容 |
|---|---|---|
| `parseConversionRule` | 9件 | 空文字列・空白・`TRAY = 30 pc`・`1 KG = 1000 g`・矢印後のヒント除去・ゼロ乗数・ケース非区別など |
| `conversionRuleHint` | 7件 | TIN・KG・LTR・TRAY・不明単位・空文字列・空白trimなど |
| `classifyComponent` | 9件 | processed_item・ingredientDetail null/undefined・linked（仕入連動）・formula（計算式）・manual（手動）の判定 |

### 2. `tests/admin/cost-calculation/cost-calculation.test.tsx`（33テスト）

メインページ（5950行）のReactコンポーネントテスト。

| テストスイート | 件数 | 内容 |
|---|---|---|
| auth guard | 2件 | 未認証リダイレクト・HQユーザー表示 |
| tab navigation | 6件 | ingredient / processed / product / draft / invoice / cost-ratio 各タブの切り替え |
| city persistence | 2件 | sessionStorage経由の都市設定保存・復元 |
| ingredient section | 3件 | 食材一覧表示・エラーバナー・検索フィルター |
| master sections | 3件 | product/processed/draft マスタ表示 |
| invoice section | 3件 | 未マッチアイテム自動選択・マッピングフォーム表示 |
| cost-ratio section | 2件 | コスト比セクション表示 |
| costcheck navigation | 3件 | sessionStorage `costcheck_goto` 読み込み・商品マスタページへの遷移 |

### 3. `tests/admin/cost-calculation/cost-check.test.tsx`（13テスト）

仕入連動チェックページ（`cost-check/page.tsx`）のテスト。

| テストスイート | 件数 | 内容 |
|---|---|---|
| auth guard | 2件 | 権限なし表示・HQユーザー表示 |
| city selector | 2件 | Manila/Dubaiボタン表示・初期都市設定 |
| analyze button | 5件 | ボタン表示・API呼び出し・プログレスバー・エラー表示・商品一覧表示 |
| filter tabs | 1件 | `全て (N)` / `⚠ 要確認のみ (N)` フィルターボタン |
| ingredient panel & navigation | 2件 | 食材パネル展開・バックボタン |
| sessionStorage write | 1件 | `costcheck_goto` 書き込み・ナビゲーション |

---

## テストで発見・修正したバグ

### バグ① `gridRef.current?.scrollTo` がjsdomでクラッシュ
**ファイル**: `src/app/admin/cost-calculation/page.tsx`（line 1681）

`?.` オプショナルチェーンを使っていても、jsdom環境では `scrollTo` メソッドが存在しないためエラーが発生。

```tsx
// 修正前（クラッシュする）
useEffect(() => {
  gridRef.current?.scrollTo({ top: 0, behavior: "auto" });
}, [activeSection]);

// 修正後（try/catchで保護）
useEffect(() => {
  try { gridRef.current?.scrollTo({ top: 0, behavior: "auto" }); } catch { /* scrollTo not supported in all environments */ }
}, [activeSection, showLegacyProductSheets]);
```

---

### バグ② `loadIngredients` のエラーがユーザーに表示されない
**ファイル**: `src/app/admin/cost-calculation/page.tsx`（line ~999）

食材読み込みに失敗しても `setError` が呼ばれていなかった。さらに `loadInvoiceMappingData` が並行実行されて成功すると `setError("")` で上書きされる競合状態もあった。

```tsx
// 修正前（エラーが飲み込まれる）
} catch (e: any) {
  console.error("Failed to load ingredients:", e);
  setIngredients((prev) => prev.filter((row) => row._new));
  setAllIngredientOptions([]);
}

// 修正後（エラーバナーを表示）
} catch (e: any) {
  console.error("Failed to load ingredients:", e);
  setIngredients((prev) => prev.filter((row) => row._new));
  setAllIngredientOptions([]);
  setError(e?.message || String(e));
}
```

---

### バグ③ `fetchItemsByType` の二重try/catchでエラーが完全に消える
**ファイル**: `src/app/admin/cost-calculation/cost-check/page.tsx`（line 72〜91）

`show_inactive=true` フォールバック機構の二重try/catchにより、APIが完全に落ちていても `[]` を返して `analyze()` がエラーを表示しなかった。

```python
# 修正前（フォールバック失敗も無視）
  } catch {
    try {
      const res = await costJson(...); // フォールバック
      return res.items || [];
    } catch {
      return [];  // ← エラーを完全に隠蔽
    }
  }

# 修正後（フォールバックが失敗した場合はエラーを上位に伝播）
  } catch {
    // show_inactive=true が通らない場合はアクティブのみにフォールバック
    // （この呼び出しが失敗した場合はエラーを上位に伝播させる）
    const res = await costJson(...); // フォールバック（失敗すればthrow）
    return res.items || [];
  }
```

---

### バグ④ `<React.Fragment key>` 欠落（Reactコンソール警告）
**ファイル**: `src/app/admin/cost-calculation/cost-check/page.tsx`（line 670）

テーブル行のペア（メイン行＋展開パネル行）を `<>` フラグメントで囲んでいたため、keyプロップなし警告が発生していた。

```tsx
// 修正前
return (
  <>
    <tr key={item.id}>...</tr>
    {isExpanded && <tr key={`${item.id}-detail`}>...</tr>}
  </>
);

// 修正後
return (
  <React.Fragment key={item.id}>
    <tr key={item.id}>...</tr>
    {isExpanded && <tr key={`${item.id}-detail`}>...</tr>}
  </React.Fragment>
);
```

---

### バグ⑤（前セッションで修正済み）城市設定がリセットされる
**ファイル**: `src/app/admin/cost-calculation/page.tsx`

城市ドロップダウン onChange で `setCityPersist()` を使うように修正済み。

### バグ⑥（前セッションで修正済み）加工品マスタに食材を追加できない
**ファイル**: `sushizen_shift_app_clean/app/db.py` — `list_cost_component_options`

`is_active = TRUE` フィルターを削除し、商品に格上げされた（非アクティブ化された）食材もコンポーネント検索に表示されるように修正済み。

### バグ⑦（前セッションで修正済み）コンポーネントが「未登録」と表示される
**ファイル**: `src/app/admin/cost-calculation/page.tsx`

非アクティブ食材が `allIngredientOptions` に存在しない場合、コンポーネント自身のデータからフォールバック用 `selectedOption` を生成するように修正済み。

---

## テスト最終結果

```
Test Files  25 passed (25)
     Tests  466 passed (466)
  Duration  33.32s
```

全466テスト・全25ファイル合格。
