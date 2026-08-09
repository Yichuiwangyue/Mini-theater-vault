// ============================================================
// 小剧场收藏夹 Mini Theater Vault
// 一个 SillyTavern 第三方扩展：本地保存"小剧场"文本，
// 支持作者标注、分类/标签、搜索，并可一键插入或发送到聊天框。
// ============================================================

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const MODULE_NAME = "mini_theater_vault";
const DEFAULT_CATEGORIES = ["日常", "约会", "历史", "节日", "任务", "其他"];

let currentEditId = null;

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
            author: "系统示例",
            category: "历史",
            tags: ["服饰", "历史", "日常"],
            content:
                "现在停止角色扮演。请把时间线调整到{{user}}和{{char}}交往前的时间点，在这个背景下，如果{{user}}好奇着平安时期的服饰的话，两人会怎么相处呢？\n请生成一个小剧场，内容是{{char}}和{{user}}的行动和相处。（此为示例条目，可编辑或删除，仅用于演示格式）",
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
            <input id="mt_search" type="text" placeholder="搜索标题 / 内容 / 标签 / 作者..." />
            <select id="mt_category_filter"><option value="">全部分类</option></select>
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
                    <input id="mt_field_category" list="mt_category_list" type="text" placeholder="如：日常 / 约会 / 历史" />
                    <datalist id="mt_category_list"></datalist>
                </div>
            </div>
            <label>标签（用逗号分隔）</label>
            <input id="mt_field_tags" type="text" placeholder="例如：服饰,历史,搞笑" />
            <label>正文内容</label>
            <textarea id="mt_field_content" rows="10" placeholder="粘贴或输入小剧场文本，可包含 {{user}} / {{char}} 宏，发送时会自动替换"></textarea>
            <div class="mt-editor-actions">
                <button id="mt_save" class="menu_button">保存</button>
                <button id="mt_cancel" class="menu_button">取消</button>
            </div>
        </div>
    </div>`;
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
    const category = $("#mt_category_filter").val();

    let entries = settings.entries.slice().sort((a, b) => b.updatedAt - a.updatedAt);

    if (category) {
        entries = entries.filter((e) => e.category === category);
    }
    if (keyword) {
        entries = entries.filter((e) => {
            const hay = [e.title, e.author, e.category, e.content, (e.tags || []).join(",")]
                .join(" ")
                .toLowerCase();
            return hay.includes(keyword);
        });
    }

    const $list = $("#mt_list");
    $list.empty();

    if (entries.length === 0) {
        $list.append(`<div class="mt-empty">没有找到匹配的小剧场，点右上角 ➕ 新增一个吧～</div>`);
        return;
    }

    entries.forEach((entry) => {
        const previewRaw = entry.content.slice(0, 120).replace(/\n/g, " ");
        const preview = escapeHtml(previewRaw);
        const tags = (entry.tags || []).map((t) => `<span class="mt-tag">#${escapeHtml(t)}</span>`).join(" ");
        const date = new Date(entry.updatedAt).toLocaleDateString();
        $list.append(`
            <div class="mt-item" data-id="${entry.id}">
                <div class="mt-item-head">
                    <strong>${escapeHtml(entry.title)}</strong>
                    <span class="mt-badge">${escapeHtml(entry.category || "未分类")}</span>
                </div>
                <div class="mt-item-meta">作者：${escapeHtml(entry.author || "匿名")} · ${date} ${tags}</div>
                <div class="mt-item-preview">${preview}${entry.content.length > 120 ? "…" : ""}</div>
                <div class="mt-item-actions">
                    <button class="menu_button mt-send" title="直接发送"><i class="fa-solid fa-paper-plane"></i> 发送</button>
                    <button class="menu_button mt-insert" title="插入到输入框"><i class="fa-solid fa-arrow-turn-down"></i> 插入</button>
                    <button class="menu_button mt-copy" title="复制到剪贴板"><i class="fa-solid fa-copy"></i></button>
                    <button class="menu_button mt-edit" title="编辑"><i class="fa-solid fa-pen"></i></button>
                    <button class="menu_button mt-delete" title="删除"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `);
    });
}

// ---------------- 发送/插入 ----------------

function sendToChat(text, autoSend) {
    const textarea = document.getElementById("send_textarea");
    if (!textarea) {
        toastr.error("未找到聊天输入框，请确认当前处于聊天界面");
        return;
    }
    textarea.value = text;
    $(textarea).trigger("input").trigger("change");

    if (autoSend) {
        setTimeout(() => {
            const sendBtn = document.getElementById("send_but");
            if (sendBtn) sendBtn.click();
        }, 50);
        toastr.success("已发送");
    } else {
        textarea.focus();
        toastr.success("已插入到输入框，请检查后发送");
    }
}

// ---------------- 编辑器 ----------------

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
    const title = $("#mt_field_title").val().toString().trim();
    const content = $("#mt_field_content").val().toString().trim();
    if (!title || !content) {
        toastr.warning("标题和正文都不能为空哦");
        return;
    }
    const author = $("#mt_field_author").val().toString().trim() || "匿名";
    const category = $("#mt_field_category").val().toString().trim() || "其他";
    const tags = $("#mt_field_tags")
        .val()
        .toString()
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);

    const settings = getSettings();
    const now = Date.now();

    if (currentEditId) {
        const entry = settings.entries.find((e) => e.id === currentEditId);
        if (entry) {
            Object.assign(entry, { title, author, category, tags, content, updatedAt: now });
        }
    } else {
        settings.entries.push({
            id: generateId(),
            title,
            author,
            category,
            tags,
            content,
            createdAt: now,
            updatedAt: now,
        });
    }

    persist();
    closeEditor();
    updateCategoryOptions();
    renderList();
    toastr.success("已保存");
}

// ---------------- 导入 / 导出 ----------------

function exportEntries() {
    const settings = getSettings();
    const blob = new Blob([JSON.stringify(settings.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mini_theater_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function importEntries(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!Array.isArray(data)) throw new Error("格式不正确");
            const settings = getSettings();
            let count = 0;
            data.forEach((item) => {
                if (item && item.title && item.content) {
                    settings.entries.push({
                        id: generateId(),
                        title: String(item.title),
                        author: String(item.author || "匿名"),
                        category: String(item.category || "其他"),
                        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
                        content: String(item.content),
                        createdAt: item.createdAt || Date.now(),
                        updatedAt: Date.now(),
                    });
                    count++;
                }
            });
            persist();
            updateCategoryOptions();
            renderList();
            toastr.success(`成功导入 ${count} 条小剧场`);
        } catch (e) {
            toastr.error("导入失败：文件格式不正确");
        }
    };
    reader.readAsText(file);
}

// ---------------- 事件绑定 ----------------

function bindEvents() {
    $(document).on("click", "#mt_close, #mt_overlay", () => {
        $("#mini_theater_panel, #mt_overlay").removeClass("mt-show");
    });

    $(document).on("click", "#mt_add", () => openEditor(null));
    $(document).on("click", "#mt_cancel", closeEditor);
    $(document).on("click", "#mt_save", saveEditor);

    // 手机上点某个输入框时，键盘弹出前后延迟一下再把该输入框滚动到可视区域中央，
    // 避免被键盘挡住或钉在屏幕外够不着。
    $(document).on("focus", "#mini_theater_editor input, #mini_theater_editor textarea", function () {
        const el = this;
        setTimeout(() => {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 300);
    });

    $(document).on("input", "#mt_search", renderList);
    $(document).on("change", "#mt_category_filter", renderList);

    $(document).on("click", "#mt_export", exportEntries);
    $(document).on("click", "#mt_import", () => $("#mt_import_file").trigger("click"));
    $(document).on("change", "#mt_import_file", (e) => {
        const file = e.target.files[0];
        if (file) importEntries(file);
        e.target.value = "";
    });

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
            navigator.clipboard
                .writeText(entry.content)
                .then(() => toastr.success("已复制到剪贴板"))
                .catch(() => toastr.error("复制失败，请手动选择文本复制"));
        }
    });

    $(document).on("click", ".mt-item .mt-edit", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) openEditor(entry);
    });

    $(document).on("click", ".mt-item .mt-delete", function () {
        const id = $(this).closest(".mt-item").data("id");
        if (!confirm("确定要删除这条小剧场吗？此操作无法撤销。")) return;
        const settings = getSettings();
        settings.entries = settings.entries.filter((x) => x.id !== id);
        persist();
        updateCategoryOptions();
        renderList();
        toastr.success("已删除");
    });
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
