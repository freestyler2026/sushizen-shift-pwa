#!/usr/bin/env python3
"""
【Quality Check】見本画像 フォルダの中身を
Sushi ZEN QC > QC_ROOT > 合格画像（マニラ） へコピーするスクリプト
--------------------------------------------------------------
実行方法:
  cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
  python3 replace_manila_ref_images.py

処理内容:
  1. Sushi ZEN QC Shared Drive 内の QC_ROOT > 合格画像（マニラ）を検索
  2. 移動元フォルダのサブフォルダ構造を再現しながら画像をコピー
  3. コピー完了後、移動元のサブフォルダをゴミ箱に移動
  ※ Shared Drive 間はフォルダ移動不可のため copy + trash で対応
"""

import json
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

# ============================================================
# 設定
# ============================================================
SERVICE_ACCOUNT_JSON = "/Users/jaynishimura/Desktop/sushizen_shift_app_clean/service-account.json"

# ZEN Menu image > Philippines > 【Quality Check】見本画像
SOURCE_FOLDER_ID = "1z-j0lO9Y3YiVa1ti2X373y6aD_CbIgSb"

# Sushi ZEN QC Shared Drive
SUSHI_ZEN_QC_DRIVE_ID = "0AL01M9t-R6oUUk9PVA"

TARGET_FOLDER_NAME = "合格画像（マニラ）"
QC_ROOT_NAME = "QC_ROOT"

# ============================================================
# 認証
# ============================================================
def get_drive():
    with open(SERVICE_ACCOUNT_JSON) as f:
        info = json.load(f)
    pk = info.get("private_key", "")
    if "\\n" in pk:
        info["private_key"] = pk.replace("\\n", "\n")
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/drive"]
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def list_items(drive, folder_id, drive_id=None):
    kwargs = dict(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id,name,mimeType)",
        pageSize=1000,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    )
    kwargs["corpora"] = "drive" if drive_id else "allDrives"
    if drive_id:
        kwargs["driveId"] = drive_id
    resp = drive.files().list(**kwargs).execute()
    return resp.get("files", [])


def find_folder(drive, parent_id, name, drive_id=None):
    items = list_items(drive, parent_id, drive_id=drive_id)
    for item in items:
        if item["name"] == name and item["mimeType"] == "application/vnd.google-apps.folder":
            return item
    print(f"  ❌ フォルダ '{name}' が見つかりません。")
    for item in items:
        print(f"    - '{item['name']}' ({item['mimeType']})")
    if not items:
        print("    （アイテムなし）")
    return None


def create_folder(drive, parent_id, name):
    meta = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    f = drive.files().create(
        body=meta,
        fields="id,name",
        supportsAllDrives=True,
    ).execute()
    return f


def copy_file(drive, file_id, dest_folder_id, name):
    body = {"name": name, "parents": [dest_folder_id]}
    f = drive.files().copy(
        fileId=file_id,
        body=body,
        fields="id,name",
        supportsAllDrives=True,
    ).execute()
    return f


def trash_item(drive, file_id):
    drive.files().update(
        fileId=file_id,
        body={"trashed": True},
        supportsAllDrives=True,
    ).execute()


def copy_folder_recursive(drive, src_id, dst_parent_id, folder_name, depth=0):
    """src_id フォルダの中身を dst_parent_id 配下に folder_name で再作成してコピー"""
    indent = "  " * (depth + 2)
    # 宛先フォルダを作成
    dst_folder = create_folder(drive, dst_parent_id, folder_name)
    print(f"{indent}📁 作成: {folder_name} → id={dst_folder['id']}")

    items = list_items(drive, src_id)
    copied = 0
    for item in items:
        if item["mimeType"] == "application/vnd.google-apps.folder":
            sub_copied = copy_folder_recursive(
                drive, item["id"], dst_folder["id"], item["name"], depth + 1
            )
            copied += sub_copied
        else:
            try:
                copy_file(drive, item["id"], dst_folder["id"], item["name"])
                print(f"{indent}  🖼 コピー: {item['name']}")
                copied += 1
            except Exception as e:
                print(f"{indent}  ❌ {item['name']} — {e}")
    return copied


# ============================================================
# メイン処理
# ============================================================
def main():
    print("🔐 Google Drive 認証中...")
    drive = get_drive()

    # 1. QC_ROOT を探す
    print(f"\n🔍 Sushi ZEN QC ドライブ内の QC_ROOT を検索中...")
    qc_root = find_folder(drive, SUSHI_ZEN_QC_DRIVE_ID, QC_ROOT_NAME, drive_id=SUSHI_ZEN_QC_DRIVE_ID)
    if not qc_root:
        sys.exit(1)
    print(f"  ✅ QC_ROOT: id={qc_root['id']}")

    # 2. 合格画像（マニラ）を探す
    print(f"\n🔍 QC_ROOT 内の '{TARGET_FOLDER_NAME}' を検索中...")
    target_folder = find_folder(drive, qc_root["id"], TARGET_FOLDER_NAME)
    if not target_folder:
        sys.exit(1)
    target_folder_id = target_folder["id"]
    print(f"  ✅ {TARGET_FOLDER_NAME}: id={target_folder_id}")

    # 3. 移動元フォルダの内容確認
    print(f"\n📂 移動元フォルダの内容を確認中...")
    source_items = list_items(drive, SOURCE_FOLDER_ID)
    if not source_items:
        print("❌ 移動元フォルダにアイテムが見つかりません。")
        sys.exit(1)

    print(f"  移動元アイテム {len(source_items)} 件:")
    for item in source_items:
        icon = "📁" if item["mimeType"] == "application/vnd.google-apps.folder" else "🖼"
        print(f"    {icon} {item['name']}")

    # 4. 確認プロンプト
    print(f"\n{'='*60}")
    print(f"⚠️  以下の操作を実行します:")
    print(f"   コピー元: 【Quality Check】見本画像 ({SOURCE_FOLDER_ID})")
    print(f"   コピー先: {TARGET_FOLDER_NAME} ({target_folder_id})")
    print(f"   方法: サブフォルダを再作成してファイルをコピー → 元フォルダをゴミ箱")
    print(f"{'='*60}")
    ans = input("続けますか？ (yes/no): ").strip().lower()
    if ans != "yes":
        print("キャンセルしました。")
        sys.exit(0)

    # 5. コピー実行
    print(f"\n📦 コピー中...")
    total_files = 0
    for i, item in enumerate(source_items, 1):
        icon = "📁" if item["mimeType"] == "application/vnd.google-apps.folder" else "🖼"
        print(f"\n  [{i}/{len(source_items)}] {icon} {item['name']}")
        if item["mimeType"] == "application/vnd.google-apps.folder":
            n = copy_folder_recursive(drive, item["id"], target_folder_id, item["name"])
            total_files += n
        else:
            try:
                copy_file(drive, item["id"], target_folder_id, item["name"])
                print(f"    ✅ コピー完了")
                total_files += 1
            except Exception as e:
                print(f"    ❌ 失敗: {e}")

    # 6. 元フォルダをゴミ箱へ
    print(f"\n🗑️  コピー元フォルダをゴミ箱に移動中...")
    for item in source_items:
        try:
            trash_item(drive, item["id"])
            print(f"  ゴミ箱 → {item['name']}")
        except Exception as e:
            print(f"  ⚠️  ゴミ箱移動失敗: {item['name']} — {e}")

    print(f"\n{'='*60}")
    print(f"✅ 完了！ {total_files} ファイルをコピーしました。")
    print(f"   コピー先: https://drive.google.com/drive/folders/{target_folder_id}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
