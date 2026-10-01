// ==UserScript==
// @name         可擴充自動導向工具 (Custom Redirect Engine)
// @namespace    https://tampermonkey.net/
// @version      1.4.0
// @description  可自訂與擴充規則的網址自動轉址/導向腳本（整合 QQ 轉址與 Mojang/Mojira 跳轉，由 Gemini 生成）
// @author       You & MangoJellyPudding
// @match        https://bugs.mojang.com/*
// @match        https://report.bugs.mojang.com/*
// @match        https://c.pc.qq.com/*
// @match        https://jump2.qq.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * 工具函式：多層解碼 URL（防止巢狀 encodeURIComponent）
     */
    function multiDecode(url) {
        let prev;
        do {
            prev = url;
            try {
                url = decodeURIComponent(url);
            } catch {
                break;
            }
        } while (url !== prev);
        return url;
    }

    /**
     * 導向規則設定清單
     */
    const REDIRECT_RULES = [
        // 規則 1：Mojang Bugs & Service Desk 自動轉移至 Mojira.dev
        {
            name: 'Mojang Bugs to Mojira.dev',
            enabled: true,
            match: (url) => url.hostname === 'bugs.mojang.com' || url.hostname === 'report.bugs.mojang.com',
            redirect: (url) => {
                // 1. 若含有 destination 查詢參數（如 login 頁跳轉）
                const dest = url.searchParams.get('destination');
                if (dest) {
                    const decodedDest = multiDecode(dest);
                    const destMatch = decodedDest.match(/([A-Za-z0-9]+-\d+)/i);
                    if (destMatch) {
                        return `https://mojira.dev/${destMatch[1]}`;
                    }
                }

                // 2. 一般路徑比對（支援 bugs.mojang.com 與 report.bugs.mojang.com 各種 portal/browse 格式）
                const fullUrlDecoded = multiDecode(url.href);
                const pathMatch = fullUrlDecoded.match(/(?:issues\/|portal\/\d+\/|browse\/)([A-Za-z0-9]+-\d+)/i);
                if (pathMatch) {
                    return `https://mojira.dev/${pathMatch[1]}`;
                }

                return null;
            },
            replaceHistory: true
        },

        // 規則 2：QQ 外鏈轉址清理與彈窗確認
        {
            name: 'QQ Link Redirect Cleaner',
            enabled: true,
            match: (url) => url.hostname === 'c.pc.qq.com' || url.hostname === 'jump2.qq.com',
            redirect: (url) => {
                const rawUrl =
                    url.searchParams.get('url') ||
                    url.searchParams.get('pfurl') ||
                    url.searchParams.get('dest') ||
                    url.searchParams.get('target');

                if (!rawUrl) return null;

                const decodedUrl = multiDecode(rawUrl);
                let urlObj;
                try {
                    urlObj = new URL(decodedUrl);
                } catch {
                    console.error('[RedirectEngine] 無效的 QQ 目標網址:', decodedUrl);
                    return null;
                }

                let path = urlObj.pathname;

                // 修正 QQ 自動補斜線結尾的問題
                if (/\.[a-z0-9]{1,8}\/$/i.test(path)) {
                    path = path.slice(0, -1);
                } else if (/^\/[A-Za-z0-9_-]{6,}\/$/.test(path)) {                     path = path.slice(0, -1);                 } else if (/^\/[A-Fa-f0-9]{6,}\/$/.test(path)) {
                    path = path.slice(0, -1);
                }

                urlObj.pathname = path;
                return urlObj.toString();
            },
            confirm: (targetUrl) => {
                try {
                    const urlObj = new URL(targetUrl);
                    const displayUrl =
                        urlObj.origin +
                        decodeURIComponent(urlObj.pathname) +
                        urlObj.search +
                        urlObj.hash;
                    return confirm(`是否跳轉到以下連結？\n\n${displayUrl}`);
                } catch {
                    return confirm(`是否跳轉到以下連結？\n\n${targetUrl}`);
                }
            },
            replaceHistory: true
        }
    ];

    /**
     * 核心比對與導向執行器
     */
    function executeRedirectEngine() {
        const currentHref = window.location.href;
        let currentUrl;
        try {
            currentUrl = new URL(currentHref);
        } catch {
            return false;
        }

        for (const rule of REDIRECT_RULES) {
            if (!rule.enabled) continue;

            let isMatched = false;
            let matchResult = null;

            if (rule.match instanceof RegExp) {
                matchResult = currentHref.match(rule.match);
                isMatched = Boolean(matchResult);
            } else if (typeof rule.match === 'string') {
                isMatched = currentHref.startsWith(rule.match);
            } else if (typeof rule.match === 'function') {
                isMatched = Boolean(rule.match(currentUrl));
            }

            if (!isMatched) continue;

            let targetUrl = '';
            if (typeof rule.redirect === 'function') {
                targetUrl = rule.redirect(currentUrl, matchResult);
            } else if (typeof rule.redirect === 'string') {
                if (rule.match instanceof RegExp) {
                    targetUrl = currentHref.replace(rule.match, rule.redirect);
                } else {
                    targetUrl = rule.redirect;
                }
            }

            if (targetUrl && targetUrl !== currentHref) {
                if (typeof rule.confirm === 'function') {
                    const approved = rule.confirm(targetUrl);
                    if (!approved) {
                        console.info(`[RedirectEngine] 使用者已取消跳轉: "${rule.name}"`);
                        return true;
                    }
                }

                console.info(`[RedirectEngine] 觸發規則: "${rule.name}" -> ${targetUrl}`);
                const replaceMode = rule.replaceHistory !== false;

                if (replaceMode) {
                    window.location.replace(targetUrl);
                } else {
                    window.location.href = targetUrl;
                }
                return true;
            }
        }
        return false;
    }

    if (!executeRedirectEngine()) {
        window.addEventListener('DOMContentLoaded', () => {
            executeRedirectEngine();
        });
    }
})();
