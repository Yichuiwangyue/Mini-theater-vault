// ============================================================
// 小剧场收藏夹 Mini Theater Vault (Hotfix Version)
// ============================================================

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const MODULE_NAME = "mini_theater_vault";
const DEFAULT_CATEGORIES = ["日常", "约会", "历史", "节日", "任务", "其他"];

let currentEditId = null;
let collapsedCategories = new Set();

// ---------------- 数据层 ----------------

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = { entries: [] };
    }
    if (!Array.isArray(extension_settings[MODULE_NAME].entries)) {
        extension_settings[MODULE_NAME].entries = [];
    }
    return extension_settings[MODULE_NAME];
}

function persist() {
    saveSettingsDebounced();
}

function generateId() {
    return `mt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function seedDefaultEntry(settings) {
    if (settings.entries.length === 0) {
        settings.entries.push({
            id: generateId(),
            title: "示例·平安时期的服饰",
            author: "苹果老师",
            category: "历史",
            tags: ["服饰", "历史", "日常"],
            content: "现在停止角色扮演。请把时间线调整到{{user}}和{{char}}交往前的点...（示例内容）",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
}

// ---------------- UI 构建 ----------------

function panelHtml() {
    return `
    <!-- 遮罩层 -->
    <div id="mt_overlay" class="mt-overlay"></div>
    
    <!-- 主面板 -->
    <div id="mini_theater_panel" class="mt-panel">
        <div class="mt-header">
            <span class="mt-title"><i class="fa-solid fa-masks-theater"></i> 小剧场收藏夹</span>
            <div class="mt-header-btns">
                <button id="mt_add" class="menu_button" title="新增"><i class="fa-solid fa-plus"></i></button>
                <button id="mt_export" class="menu_button" title="导出"><i class="fa-solid fa-download"></i></button>
                <button id="mt_import" class="menu_button" title="导入"><i class="fa-solid fa-upload"></i></button>
                <button id="mt_close_btn" class="menu_button" title="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="mt-toolbar">
            <input id="mt_search" type="text" placeholder="搜索标题 / 内容 / 标签..." />
            <div class="mt-filters">
                <select id="mt_category_filter"><option value="">全部分类</option></select>
                <select id="mt_sort_order">
                    <option value="updated_desc">最近编辑</option>
                    <option value="created_desc">最早创建</option>
                    <option value="title_asc">标题排序</option>
                </select>
            </div>
        </div>
        <div id="mt_list" class="mt-list"></div>
        <input id="mt_import_file" type="file" accept="application/json" style="display:none;" />
    </div>

    <!-- 编辑器面板 -->
    <div id="mini_theater_editor" class="mt-editor">
        <div class="mt-editor-inner">
            <h3 id="mt_editor_title">新增小剧场</h3>
            <label>标题</label>
            <input id="mt_field_title" type="text" />
            <div class="mt-editor-row">
                <div style="flex:1">
                    <label>作者</label>
                    <input id="mt_field_author" type="text" />
                </div>
                <div style="flex:1">
                    <label>分类</label>
                    <input id="mt_field_category" list="mt_category_list" type="text" />
                    <datalist id="mt_category_list"></datalist>
                </div>
            </div>
            <label>标签（逗号隔开）</label>
            <input id="mt_field_tags" type="text" />
            <label>正文内容</label>
            <textarea id="mt_field_content" rows="8"></textarea>
            <div class="mt-editor-actions">
                <button id="mt_save" class="menu_button">保存</button>
                <button id="mt_cancel" class="menu_button">取消</button>
            </div>
        </div>
    </div>

    <style>
        /* 基础状态：默认隐藏 */
        .mt-overlay { 
            display: none; 
            position: fixed; 
            top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); 
            z-index: 2000; 
        }
        .mt-panel { 
            display: none; 
            position: fixed; 
            top: 50%; left: 50%; 
            transform: translate(-50%, -50%); 
            width: 90%; max-width: 500px; max-height: 80vh; 
            background: var(--main-bg-color); 
            color: var(--text-color);
            border-radius: 10px; 
            z-index: 2001; 
            flex-direction: column;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
            border: 1px solid var(--smart-line-color);
        }
        .mt-editor {
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 2005;
            align-items: center; justify-content: center;
        }

        /* 显示状态 */
        .mt-overlay.mt-show, .mt-panel.mt-show, .mt-editor.mt-show { display: flex; }

        /* UI 内部布局 */
        .mt-header { padding: 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--smart-line-color); }
        .mt-title { font-weight: bold; font-size: 1.2em; }
        .mt-toolbar { padding: 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--smart-line-color); }
        .mt-filters { display: flex; gap: 5px; }
        .mt-filters select { flex: 1; height: 32px; background: var(--input-bg-color); color: var(--text-color); border: 1px solid var(--smart-line-color); }
        
        .mt-list { flex: 1; overflow-y: auto; padding: 10px; min-height: 0; }

        /* 分类折叠样式 */
        .mt-category-group { margin-bottom: 10px; width: 100%; }
        .mt-group-header { 
            background: var(--nav-bar-color); 
            padding: 10px; cursor: pointer; border-radius: 5px;
            display: flex; align-items: center; font-weight: bold;
        }
        .mt-group-header i { margin-right: 10px; transition: 0.2s; }
        .mt-group-header.collapsed i { transform: rotate(-90deg); }
        .mt-group-content.hidden { display: none; }

        /* 卡片样式 */
        .mt-item { 
            position: relative; background: var(--nav-bar-color); 
            border: 1px solid var(--smart-line-color); border-radius: 8px; 
            padding: 12px; margin: 8px 0; 
        }
        .mt-item-head { display: flex; justify-content: space-between; align-items: flex-start; }
        .mt-badge { background: #800000; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em; }
        .mt-item-meta { font-size: 0.85em; opacity: 0.8; margin: 5px 0; }
        .mt-item-preview { font-size: 0.9em; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .mt-item-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; }
        
        .mt-editor-inner { background: var(--main-bg-color); padding: 20px; border-radius: 10px; width: 90%; max-width: 450px; }
        .mt-editor-row { display: flex; gap: 10px; margin-bottom: 10px; }
        .mt-editor-inner input, .mt-editor-inner textarea { width: 100%; background: var(--input-bg-color); color: var(--text-color); border: 1px solid var(--smart-line-color); padding: 8px; margin-top: 5px; }
    </style>
    `;
}

// ---------------- 逻辑层 ----------------

function getAllCategories(settings) {
    const set = new Set(DEFAULT_CATEGORIES);
    settings.entries.forEach((e) => { if (e.category) set.add(e.category); });
    return Array.from(set);
}

function updateCategoryOptions() {
    const settings = getSettings();
    const categories = getAllCategories(settings);
    const $filter = $("#mt_category_filter");
    $filter.empty().append(`<option value="">全部分类</option>`);
    categories.forEach((c) => $filter.append(`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));

    const $list = $("#mt_category_list");
    $list.empty();
    categories.forEach((c) => $list.append(`<option value="${escapeHtml(c)}"></option>`));
}

function renderList() {
    const settings = getSettings();
    const keyword = ($("#mt_search").val() || "").toString().trim().toLowerCase();
    const categoryFilter = $("#mt_category_filter").val();
    const sortOrder = $("#mt_sort_order").val();

    let entries = [...settings.entries];

    if (categoryFilter) {
        entries = entries.filter((e) => e.category === categoryFilter);
    }
    if (keyword) {
        entries = entries.filter((e) => {
            const hay = [e.title, e.author, e.content, (e.tags || []).join(",")].join(" ").toLowerCase();
            return hay.includes(keyword);
        });
    }

    entries.sort((a, b) => {
        if (sortOrder === "updated_desc") return b.updatedAt - a.updatedAt;
        if (sortOrder === "created_desc") return a.createdAt - b.createdAt;
        if (sortOrder === "title_asc") return a.title.localeCompare(b.title, 'zh-CN');
        return 0;
    });

    const groups = {};
    entries.forEach(entry => {
        const cat = entry.category || "未分类";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(entry);
    });

    const $list = $("#mt_list");
    $list.empty();

    Object.keys(groups).sort().forEach(catName => {
        const catEntries = groups[catName];
        const isCollapsed = collapsedCategories.has(catName);
        const $group = $(`
            <div class="mt-category-group">
                <div class="mt-group-header ${isCollapsed ? 'collapsed' : ''}" data-cat="${escapeHtml(catName)}">
                    <i class="fa-solid fa-chevron-down"></i>
                    <span>${escapeHtml(catName)} (${catEntries.length})</span>
                </div>
                <div class="mt-group-content ${isCollapsed ? 'hidden' : ''}"></div>
            </div>
        `);
        const $content = $group.find(".mt-group-content");
        catEntries.forEach((entry) => {
            const preview = escapeHtml(entry.content.slice(0, 100).replace(/\n/g, " "));
            const tags = (entry.tags || []).map((t) => `<span class="mt-tag">#${escapeHtml(t)}</span>`).join(" ");
            $content.append(`
                <div class="mt-item" data-id="${entry.id}">
                    <div class="mt-item-head">
                        <strong>${escapeHtml(entry.title)}</strong>
                        <span class="mt-badge">${escapeHtml(entry.category || "未分类")}</span>
                    </div>
                    <div class="mt-item-meta">${escapeHtml(entry.author || "匿名")} · ${tags}</div>
                    <div class="mt-item-preview">${preview}...</div>
                    <div class="mt-item-actions">
                        <button class="menu_button mt-send"><i class="fa-solid fa-paper-plane"></i> 发送</button>
                        <button class="menu_button mt-insert"><i class="fa-solid fa-arrow-turn-down"></i> 插入</button>
                        <button class="menu_button mt-copy"><i class="fa-solid fa-copy"></i></button>
                        <button class="menu_button mt-edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="menu_button mt-delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `);
        });
        $list.append($group);
    });
}

// ---------------- 事件 ----------------

function bindEvents() {
    // 关闭功能 (点击 X 或 遮罩层)
    $(document).on("click", "#mt_close_btn, #mt_overlay", () => {
        $("#mini_theater_panel, #mt_overlay").removeClass("mt-show");
    });

    // 折叠功能
    $(document).on("click", ".mt-group-header", function() {
        const catName = $(this).data("cat");
        const $content = $(this).next(".mt-group-content");
        if (collapsedCategories.has(catName)) {
            collapsedCategories.delete(catName);
            $content.removeClass("hidden");
            $(this).removeClass("collapsed");
        } else {
            collapsedCategories.add(catName);
            $content.addClass("hidden");
            $(this).addClass("collapsed");
        }
    });

    $(document).on("click", "#mt_add", () => openEditor(null));
    $(document).on("click", "#mt_cancel", closeEditor);
    $(document).on("click", "#mt_save", saveEditor);
    $(document).on("input", "#mt_search", renderList);
    $(document).on("change", "#mt_category_filter, #mt_sort_order", renderList);

    $(document).on("click", ".mt-item .mt-send", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find(x => x.id === id);
        if (entry) sendToChat(entry.content, true);
    });

    $(document).on("click", ".mt-item .mt-insert", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find(x => x.id === id);
        if (entry) sendToChat(entry.content, false);
    });

    $(document).on("click", ".mt-item .mt-copy", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find(x => x.id === id);
        if (entry) {
            navigator.clipboard.writeText(entry.content).then(() => toastr.success("已复制"));
        }
    });

    $(document).on("click", ".mt-item .mt-edit", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find(x => x.id === id);
        if (entry) openEditor(entry);
    });

    $(document).on("click", ".mt-item .mt-delete", function () {
        const id = $(this).closest(".mt-item").data("id");
        if (!confirm("确定删除吗？")) return;
        const settings = getSettings();
        settings.entries = settings.entries.filter(x => x.id !== id);
        persist();
        renderList();
    });

    $(document).on("click", "#mt_export", exportEntries);
    $(document).on("click", "#mt_import", () => $("#mt_import_file").trigger("click"));
    $(document).on("change", "#mt_import_file", (e) => {
        const file = e.target.files[0];
        if (file) importEntries(file);
        e.target.value = "";
    });
}

function sendToChat(text, autoSend) {
    const textarea = document.getElementById("send_textarea");
    if (!textarea) return toastr.error("未找到输入框");
    textarea.value = text;
    $(textarea).trigger("input").trigger("change");
    if (autoSend) setTimeout(() => { document.getElementById("send_but")?.click(); }, 50);
}

function openEditor(entry) {
    currentEditId = entry ? entry.id : null;
    $("#mt_editor_title").text(entry ? "编辑小剧场" : "新增小剧场");
    $("#mt_field_title").val(entry ? entry.title : "");
    $("#mt_field_author").val(entry ? entry.author : "");
    $("#mt_field_category").val(entry ? entry.category : "");
    $("#mt_field_tags").val(entry ? (entry.tags || []).join(", ") : "");
    $("#mt_field_content").val(entry ? entry.content : "");
    $("#mini_theater_editor").addClass("mt-show");
}

function closeEditor() { $("#mini_theater_editor").removeClass("mt-show"); currentEditId = null; }

function saveEditor() {
    const title = $("#mt_field_title").val().trim();
    const content = $("#mt_field_content").val().trim();
    if (!title || !content) return toastr.warning("请填写标题和内容");
    const settings = getSettings();
    const now = Date.now();
    const data = {
        title, content, 
        author: $("#mt_field_author").val().trim() || "匿名",
        category: $("#mt_field_category").val().trim() || "其他",
        tags: $("#mt_field_tags").val().split(/[,，]/).map(t => t.trim()).filter(Boolean),
        updatedAt: now
    };
    if (currentEditId) {
        const entry = settings.entries.find(e => e.id === currentEditId);
        if (entry) Object.assign(entry, data);
    } else {
        settings.entries.push({ id: generateId(), createdAt: now, ...data });
    }
    persist();
    closeEditor();
    updateCategoryOptions();
    renderList();
    toastr.success("保存成功");
}

function exportEntries() {
    const settings = getSettings();
    const blob = new Blob([JSON.stringify(settings.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `theater_vault.json`;
    a.click();
}

function importEntries(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const settings = getSettings();
            data.forEach(item => { if (item.title && item.content) settings.entries.push({ ...item, id: generateId(), updatedAt: Date.now() }); });
            persist();
            renderList();
            toastr.success("导入成功");
        } catch (e) { toastr.error("文件错误"); }
    };
    reader.readAsText(file);
}

function openPanel() {
    $("#mini_theater_panel, #mt_overlay").addClass("mt-show");
    updateCategoryOptions();
    renderList();
}

// ---------------- 初始化 ----------------

jQuery(async () => {
    const settings = getSettings();
    seedDefaultEntry(settings);
    persist();

    // 确保只添加一次
    if ($("#mini_theater_panel").length === 0) {
        $("body").append(panelHtml());
    }
    
    bindEvents();

    const menuButton = `
        <div id="mini_theater_menu_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="小剧场收藏夹">
            <div class="fa-solid fa-masks-theater extensionsMenuExtensionButton"></div>
            <span>小剧场收藏夹</span>
        </div>`;
    $("#extensionsMenu").append(menuButton);
    $(document).on("click", "#mini_theater_menu_button", openPanel);
});