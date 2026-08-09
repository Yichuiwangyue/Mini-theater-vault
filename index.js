// ============================================================
// 小剧场收藏夹 Mini Theater Vault (Optimized Version)
// 一个 SillyTavern 第三方扩展：本地保存"小剧场"文本
// ============================================================

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const MODULE_NAME = "mini_theater_vault";
const DEFAULT_CATEGORIES = ["日常", "约会", "历史", "节日", "任务", "其他"];

let currentEditId = null;
// 用于记录哪些分类被折叠了（临时记录，刷新后重置，如果需要持久化可以存入 settings）
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
            title: "示例·百物语",
            author: "苹果老师的天才构想",
            category: "刀剑乱舞",
            tags: ["习俗", "历史", "日常"],
            content: "现在停止角色扮演。请把时间线调整到{{user}}和{{char}}交往前的时间点，在这个背景下，如果{{user}}在深夜失眠、好奇着想尝试百物语的话，两人会怎么相处呢？\n请生成一个小剧场，内容是{{char}}和{{user}}的行动和相处。会是什么样的场景呢？会去现世的店、万屋的店、还是出阵时去当时历史的店？会涉及些什么有趣的内容呢？会不会发生一些很好玩的状况或者事后衍生出讨论和吐槽呢？需符合{{user}}和{{char}}的背景设定，请结合性格、背景故事、日常偏好、人际关系等展开情节，字数要求4000字以上，如果字数不够可以适当拉长，字数没有上限。",
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
                <button id="mt_export" class="menu_button" title="导出备份 JSON"><i class="fa-solid fa-download"></i></button>
                <button id="mt_import" class="menu_button" title="导入备份 JSON"><i class="fa-solid fa-upload"></i></button>
                <button id="mt_close" class="menu_button" title="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="mt-toolbar">
            <div class="mt-search-bar">
                <input id="mt_search" type="text" placeholder="搜索关键词..." />
            </div>
            <div class="mt-filters">
                <select id="mt_category_filter" title="筛选分类"><option value="">全部分类</option></select>
                <select id="mt_sort_order" title="排序方式">
                    <option value="updated_desc">最近更新</option>
                    <option value="created_desc">最早创建</option>
                    <option value="title_asc">名称 (A-Z)</option>
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
                    <input id="mt_field_author" type="text" placeholder="你的名字/昵称" />
                </div>
                <div>
                    <label>分类</label>
                    <input id="mt_field_category" list="mt_category_list" type="text" placeholder="如：日常 / 约会" />
                    <datalist id="mt_category_list"></datalist>
                </div>
            </div>
            <label>标签（用逗号分隔）</label>
            <input id="mt_field_tags" type="text" placeholder="例如：服饰,历史,搞笑" />
            <label>正文内容</label>
            <textarea id="mt_field_content" rows="10" placeholder="文本内容..."></textarea>
            <div class="mt-editor-actions">
                <button id="mt_save" class="menu_button">保存</button>
                <button id="mt_cancel" class="menu_button">取消</button>
            </div>
        </div>
    </div>
    <style>
        .mt-toolbar { display: flex; flex-direction: column; gap: 5px; padding: 10px; border-bottom: 1px solid var(--smart-line-color); }
        .mt-filters { display: flex; gap: 5px; }
        .mt-filters select { flex: 1; padding: 5px; background: var(--input-bg-color); color: var(--text-color); border: 1px solid var(--smart-line-color); border-radius: 4px; }
        
        .mt-category-group { margin-bottom: 10px; border: 1px solid var(--smart-line-color); border-radius: 8px; overflow: hidden; }
        .mt-group-header { 
            background: var(--nav-bar-color); 
            padding: 8px 12px; 
            cursor: pointer; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            font-weight: bold;
            user-select: none;
        }
        .mt-group-header:hover { background: var(--button-highlight-color); }
        .mt-group-header i { transition: transform 0.2s; }
        .mt-group-header.collapsed i { transform: rotate(-90deg); }
        .mt-group-content { display: block; }
        .mt-group-content.hidden { display: none; }
        .mt-item { border: none; border-bottom: 1px solid var(--smart-line-color); border-radius: 0; }
        .mt-item:last-child { border-bottom: none; }
    </style>
    `;
}

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

    // 1. 过滤
    if (categoryFilter) {
        entries = entries.filter((e) => e.category === categoryFilter);
    }
    if (keyword) {
        entries = entries.filter((e) => {
            const hay = [e.title, e.author, e.category, e.content, (e.tags || []).join(",")]
                .join(" ")
                .toLowerCase();
            return hay.includes(keyword);
        });
    }

    // 2. 排序
    entries.sort((a, b) => {
        if (sortOrder === "updated_desc") return b.updatedAt - a.updatedAt;
        if (sortOrder === "created_desc") return a.createdAt - b.createdAt;
        if (sortOrder === "title_asc") return a.title.localeCompare(b.title, 'zh-CN');
        return 0;
    });

    // 3. 分组处理
    const groups = {};
    entries.forEach(entry => {
        const cat = entry.category || "其他";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(entry);
    });

    const $list = $("#mt_list");
    $list.empty();

    if (entries.length === 0) {
        $list.append(`<div class="mt-empty">没有找到匹配的小剧场～</div>`);
        return;
    }

    // 4. 渲染分组
    Object.keys(groups).sort().forEach(catName => {
        const catEntries = groups[catName];
        const isCollapsed = collapsedCategories.has(catName);
        
        const $group = $(`
            <div class="mt-category-group">
                <div class="mt-group-header ${isCollapsed ? 'collapsed' : ''}" data-cat="${escapeHtml(catName)}">
                    <span><i class="fa-solid fa-chevron-down"></i> ${escapeHtml(catName)} (${catEntries.length})</span>
                </div>
                <div class="mt-group-content ${isCollapsed ? 'hidden' : ''}"></div>
            </div>
        `);

        const $content = $group.find(".mt-group-content");

        catEntries.forEach((entry) => {
            const previewRaw = entry.content.slice(0, 100).replace(/\n/g, " ");
            const preview = escapeHtml(previewRaw);
            const tags = (entry.tags || []).map((t) => `<span class="mt-tag">#${escapeHtml(t)}</span>`).join(" ");
            const date = new Date(entry.updatedAt).toLocaleDateString();
            
            $content.append(`
                <div class="mt-item" data-id="${entry.id}">
                    <div class="mt-item-head">
                        <strong>${escapeHtml(entry.title)}</strong>
                    </div>
                    <div class="mt-item-meta">${escapeHtml(entry.author || "匿名")} · ${date} ${tags}</div>
                    <div class="mt-item-preview">${preview}${entry.content.length > 100 ? "…" : ""}</div>
                    <div class="mt-item-actions">
                        <button class="menu_button mt-send" title="直接发送"><i class="fa-solid fa-paper-plane"></i></button>
                        <button class="menu_button mt-insert" title="插入"><i class="fa-solid fa-arrow-turn-down"></i></button>
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
    $(document).on("click", "#mt_close, #mt_overlay", () => {
        $("#mini_theater_panel, #mt_overlay").removeClass("mt-show");
    });

    $(document).on("click", "#mt_add", () => openEditor(null));
    $(document).on("click", "#mt_cancel", closeEditor);
    $(document).on("click", "#mt_save", saveEditor);

    $(document).on("input", "#mt_search", renderList);
    $(document).on("change", "#mt_category_filter, #mt_sort_order", renderList);

    // 折叠事件
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

    // 功能按钮 (发送、插入、复制、编辑、删除)
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
            navigator.clipboard.writeText(entry.content)
                .then(() => toastr.success("已复制"))
                .catch(() => toastr.error("复制失败"));
        }
    });

    $(document).on("click", ".mt-item .mt-edit", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) openEditor(entry);
    });

    $(document).on("click", ".mt-item .mt-delete", function () {
        const id = $(this).closest(".mt-item").data("id");
        if (!confirm("确定删除吗？")) return;
        const settings = getSettings();
        settings.entries = settings.entries.filter((x) => x.id !== id);
        persist();
        renderList();
    });

    // 导入导出
    $(document).on("click", "#mt_export", exportEntries);
    $(document).on("click", "#mt_import", () => $("#mt_import_file").trigger("click"));
    $(document).on("change", "#mt_import_file", (e) => {
        const file = e.target.files[0];
        if (file) importEntries(file);
        e.target.value = "";
    });
}

// ---------------- 辅助功能 ----------------

function sendToChat(text, autoSend) {
    const textarea = document.getElementById("send_textarea");
    if (!textarea) return toastr.error("未找到输入框");
    textarea.value = text;
    $(textarea).trigger("input").trigger("change");
    if (autoSend) {
        setTimeout(() => { $("#send_but").click(); }, 50);
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
    if (!title || !content) return toastr.warning("请填写完整");
    
    const settings = getSettings();
    const now = Date.now();
    const entryData = {
        title,
        content,
        author: $("#mt_field_author").val().trim() || "匿名",
        category: $("#mt_field_category").val().trim() || "其他",
        tags: $("#mt_field_tags").val().split(/[,，]/).map(t => t.trim()).filter(Boolean),
        updatedAt: now
    };

    if (currentEditId) {
        const entry = settings.entries.find(e => e.id === currentEditId);
        if (entry) Object.assign(entry, entryData);
    } else {
        settings.entries.push({ id: generateId(), createdAt: now, ...entryData });
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
    a.href = url;
    a.download = `mini_theater_${new Date().toISOString().slice(0, 10)}.json`;
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
            toastr.success("导入完成");
        } catch (e) { toastr.error("格式错误"); }
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

    $("body").append(panelHtml());
    bindEvents();

    const menuButton = `
        <div id="mini_theater_menu_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="小剧场收藏夹">
            <div class="fa-solid fa-masks-theater extensionsMenuExtensionButton"></div>
            <span>小剧场收藏夹</span>
        </div>`;
    $("#extensionsMenu").append(menuButton);
    $(document).on("click", "#mini_theater_menu_button", openPanel);
});