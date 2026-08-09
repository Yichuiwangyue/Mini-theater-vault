// ============================================================
// 小剧场收藏夹 Mini Theater Vault (Hotfix Version)
// 修复了面板自动显示、无法关闭以及布局重叠的问题
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
    <div id="mt_overlay" class="mt-overlay"></div>
    <div id="mini_theater_panel" class="mt-panel">
        <div class="mt-header">
            <span class="mt-title"><i class="fa-solid fa-masks-theater"></i> 小剧场收藏夹</span>
            <div class="mt-header-btns">
                <button id="mt_add" class="menu_button" title="新增小剧场"><i class="fa-solid fa-plus"></i></button>
                <button id="mt_export" class="menu_button" title="导出 JSON"><i class="fa-solid fa-download"></i></button>
                <button id="mt_import" class="menu_button" title="导入 JSON"><i class="fa-solid fa-upload"></i></button>
                <button id="mt_close" class="menu_button" title="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="mt-toolbar">
            <input id="mt_search" type="text" placeholder="搜索标题 / 内容 / 标签 / 作者..." />
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
    <div id="mini_theater_editor" class="mt-editor">
        <div class="mt-editor-inner">
            <h3 id="mt_editor_title">新增小剧场</h3>
            <label>标题</label>
            <input id="mt_field_title" type="text" placeholder="给这段小剧场起个名字" />
            <div class="mt-editor-row">
                <div>
                    <label>作者</label>
                    <input id="mt_field_author" type="text" placeholder="作者名" />
                </div>
                <div>
                    <label>分类</label>
                    <input id="mt_field_category" list="mt_category_list" type="text" placeholder="选择或输入分类" />
                    <datalist id="mt_category_list"></datalist>
                </div>
            </div>
            <label>标签（用逗号分隔）</label>
            <input id="mt_field_tags" type="text" placeholder="服饰, 历史" />
            <label>正文内容</label>
            <textarea id="mt_field_content" rows="10"></textarea>
            <div class="mt-editor-actions">
                <button id="mt_save" class="menu_button">保存</button>
                <button id="mt_cancel" class="menu_button">取消</button>
            </div>
        </div>
    </div>
    <style>
        /* 1. 隐藏逻辑：初始状态必须设为不可见 */
        .mt-panel, .mt-overlay, .mt-editor {
            display: none; 
            pointer-events: none;
            opacity: 0;
        }

        /* 2. 显示逻辑：只有带上 .mt-show 才会出现 */
        .mt-panel.mt-show, .mt-overlay.mt-show, .mt-editor.mt-show {
            display: flex;
            pointer-events: all;
            opacity: 1;
        }

        /* 3. 基础布局 */
        #mini_theater_panel { 
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 2001;
            width: 90%;
            max-width: 600px;
            max-height: 85vh;
            background: var(--main-bg-color);
            border-radius: 10px;
            flex-direction: column;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        }
        .mt-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            z-index: 2000;
        }

        .mt-list { flex: 1; overflow-y: auto; padding: 10px; min-height: 0; }
        .mt-toolbar { padding: 10px; border-bottom: 1px solid var(--smart-line-color); display: flex; flex-direction: column; gap: 8px; }
        .mt-filters { display: flex; gap: 5px; }
        .mt-filters select { flex: 1; height: 32px; background: var(--input-bg-color); color: var(--text-color); border: 1px solid var(--smart-line-color); border-radius: 4px; }

        /* 分类折叠样式 */
        .mt-category-group { margin-bottom: 8px; width: 100%; }
        .mt-group-header { 
            background: var(--nav-bar-color); 
            padding: 10px 15px; 
            cursor: pointer; 
            display: flex; 
            align-items: center;
            font-weight: bold;
            border-radius: 8px;
            margin-bottom: 2px;
            position: relative;
        }
        .mt-group-header i { margin-right: 10px; transition: 0.2s; }
        .mt-group-header.collapsed i { transform: rotate(-90deg); }
        .mt-group-content { padding: 2px 0; }
        .mt-group-content.hidden { display: none; }

        /* 卡片内 Badge */
        .mt-item { position: relative; background: var(--nav-bar-color); border: 1px solid var(--smart-line-color); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
        .mt-item-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px; gap: 10px; }
        .mt-badge { 
            background: #800000; 
            color: white; 
            padding: 2px 8px; 
            border-radius: 10px; 
            font-size: 0.8em; 
            white-space: nowrap;
        }
    </style>
    `;
}

// ---------------- 逻辑层 ----------------

function getAllCategories(settings) {
    const set = new Set(DEFAULT_CATEGORIES);
    settings.entries.forEach((e) => {
        if (e.category) set.add(e.category);
    });
    return Array.from(set);
}

function updateCategoryOptions() {
    const settings = getSettings();
    const categories = getAllCategories(settings);
    const $filter = $("#mt_category_filter");
    const currentVal = $filter.val();
    $filter.empty().append(`<option value="">全部分类</option>`);
    categories.forEach((c) => $filter.append(`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));
    if (categories.includes(currentVal)) $filter.val(currentVal);

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
            const hay = [e.title, e.author, e.content, (e.tags || []).join(",")]
                .join(" ")
                .toLowerCase();
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

    if (entries.length === 0) {
        $list.append(`<div class="mt-empty">这里空空如也呢～</div>`);
        return;
    }

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
            const date = new Date(entry.updatedAt).toLocaleDateString();
            
            $content.append(`
                <div class="mt-item" data-id="${entry.id}">
                    <div class="mt-item-head">
                        <strong>${escapeHtml(entry.title)}</strong>
                        <span class="mt-badge">${escapeHtml(entry.category || "未分类")}</span>
                    </div>
                    <div class="mt-item-meta">${escapeHtml(entry.author || "匿名")} · ${date} ${tags}</div>
                    <div class="mt-item-preview">${preview}${entry.content.length > 100 ? "…" : ""}</div>
                    <div class="mt-item-actions">
                        <button class="menu_button mt-send" title="发送"><i class="fa-solid fa-paper-plane"></i> 发送</button>
                        <button class="menu_button mt-insert" title="插入"><i class="fa-solid fa-arrow-turn-down"></i> 插入</button>
                        <button class="menu_button mt-copy" title="复制"><i class="fa-solid fa-copy"></i></button>
                        <button class="menu_button mt-edit" title="编辑"><i class="fa-solid fa-pen"></i></button>
                        <button class="menu_button mt-delete" title="删除"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `);
        });

        $list.append($group);
    });
}

// ---------------- 事件绑定 ----------------

function bindEvents() {
    // 明确的关闭逻辑
    const hideAll = () => {
        $("#mini_theater_panel, #mt_overlay, #mini_theater_editor").removeClass("mt-show");
    };

    $(document).on("click", "#mt_close, #mt_overlay", hideAll);

    $(document).off("click", ".mt-group-header").on("click", ".mt-group-header", function(e) {
        e.stopPropagation();
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
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) sendToChat(entry.content, true);
    });

    $(document).on("click", ".mt-item .mt-insert", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) sendToChat(entry.content, false);
    });

    $(document).on("click", ".mt-item .mt-copy", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) {
            navigator.clipboard.writeText(entry.content).then(() => toastr.success("已复制"));
        }
    });

    $(document).on("click", ".mt-item .mt-edit", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) openEditor(entry);
    });

    $(document).on("click", ".mt-item .mt-delete", function () {
        const id = $(this).closest(".mt-item").data("id");
        if (!confirm("确定要删除吗？")) return;
        const settings = getSettings();
        settings.entries = settings.entries.filter((x) => x.id !== id);
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

// ---------------- 常用功能 ----------------

function sendToChat(text, autoSend) {
    const textarea = document.getElementById("send_textarea");
    if (!textarea) return toastr.error("未找到输入框");
    textarea.value = text;
    $(textarea).trigger("input").trigger("change");
    if (autoSend) {
        setTimeout(() => { document.getElementById("send_but")?.click(); }, 50);
    } else {
        textarea.focus();
    }
}

function openEditor(entry) {
    currentEditId = entry ? entry.id : null;
    $("#mt_editor_title").text(entry ? "编辑小剧场" : "新增小剧场");
    $("#mt_field_title").val(entry ? entry.title : "");
    $("#mt_field_author").val(entry ? entry.author : "");
    $("#mt_field_category").val(entry ? entry.category : "");
    $("#mt_field_tags").val(entry ? (entry.tags || []).join(", ") : "");
    $("#mt_field_content").val(entry ? entry.content : "");
    updateCategoryOptions();
    $("#mini_theater_editor").addClass("mt-show");
}

function closeEditor() {
    $("#mini_theater_editor").removeClass("mt-show");
    currentEditId = null;
}

function saveEditor() {
    const title = $("#mt_field_title").val().trim();
    const content = $("#mt_field_content").val().trim();
    if (!title || !content) return toastr.warning("标题和正文不能为空");
    
    const settings = getSettings();
    const now = Date.now();
    const data = {
        title,
        content,
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
    toastr.success("已保存");
}

function exportEntries() {
    const settings = getSettings();
    const blob = new Blob([JSON.stringify(settings.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `theater_vault_backup.json`;
    a.click();
}

function importEntries(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const settings = getSettings();
            data.forEach(item => {
                if (item.title && item.content) {
                    settings.entries.push({ ...item, id: generateId(), updatedAt: Date.now() });
                }
            });
            persist();
            renderList();
            toastr.success("导入成功");
        } catch (e) { toastr.error("导入失败：文件格式不正确"); }
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

    // 确保只添加一次 HTML，且默认是隐藏的
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