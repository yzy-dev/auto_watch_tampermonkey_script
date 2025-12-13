// ==UserScript==
// @name         浙江安全学院自动观看视频
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动观看浙江安全学院教学视频，支持自动处理弹窗、自动切换课程
// @author       Auto
// @match        https://yjaqxy.zjyjxj.cn/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        CHECK_INTERVAL: 5000,       // 检查间隔（毫秒）- 5秒
        POPUP_CHECK_INTERVAL: 1000, // 弹窗检查间隔
        WAIT_AFTER_COMPLETE: 20000, // 播放完成后等待时间（毫秒）- 20秒
        DEBUG: true,                // 调试模式
        MAX_LOG_ENTRIES: 15         // 最多显示的日志条数
    };

    // 状态管理
    const STATE = {
        currentScore: 0,
        requiredScore: 0,
        className: '',
        userName: '',
        logs: []
    };

    // 日志函数
    function log(message) {
        const timeStr = new Date().toLocaleTimeString();
        const logEntry = {
            time: timeStr,
            message: message
        };

        // 添加到日志数组
        STATE.logs.push(logEntry);
        // 保持最多 MAX_LOG_ENTRIES 条日志
        if (STATE.logs.length > CONFIG.MAX_LOG_ENTRIES) {
            STATE.logs.shift();
        }

        // 更新悬浮窗口
        updateFloatingWindow();

        if (CONFIG.DEBUG) {
            console.log(`[自动学习] ${timeStr} - ${message}`);
        }
    }

    // ==================== 用户信息获取 ====================

    // 获取用户信息
    async function fetchUserInfo() {
        try {
            // 方法1: 尝试从API获取用户信息
            const response = await fetch('/api/Page/GetUserInfo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            });
            const data = await response.json();
            if (data.Status === 200 && data.Data) {
                return data.Data.Name || data.Data.UserName || data.Data.RealName;
            }
        } catch (e) {
            log('API获取用户信息失败，尝试从页面获取: ' + e.message);
        }

        // 方法2: 从页面DOM中获取
        try {
            // 查找常见的用户名显示元素
            const userSelectors = [
                '.user-name',
                '.username',
                '.user-info',
                '[class*="user"] [class*="name"]',
                '.header-user',
                '.nav-user'
            ];

            for (const selector of userSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    const text = element.textContent.trim();
                    // 过滤掉太长的文本（可能不是用户名）
                    if (text.length > 0 && text.length < 20) {
                        return text;
                    }
                }
            }

            // 方法3: 从localStorage或sessionStorage获取
            const localUser = localStorage.getItem('userName') ||
                            localStorage.getItem('username') ||
                            sessionStorage.getItem('userName') ||
                            sessionStorage.getItem('username');
            if (localUser) {
                return localUser;
            }
        } catch (e) {
            log('从页面获取用户信息失败: ' + e.message);
        }

        return '学习者';
    }

    // ==================== 悬浮窗口功能 ====================

    // 创建悬浮窗口
    function createFloatingWindow() {
        // 检查是否已存在
        if (document.getElementById('auto-study-float')) {
            return;
        }

        const floatDiv = document.createElement('div');
        floatDiv.id = 'auto-study-float';
        floatDiv.innerHTML = `
            <div class="float-header">
                <span class="float-title">🎓 自动学习助手</span>
                <button class="float-toggle" title="最小化/展开">−</button>
                <button class="float-close" title="关闭">×</button>
            </div>
            <div class="float-content">
                <div class="user-section">
                    <div class="user-info">
                        <div class="user-greeting">你好，</div>
                        <div class="user-name" id="float-user-name">加载中...</div>
                    </div>
                </div>
                <div class="progress-section">
                    <div class="progress-title">学习进度</div>
                    <div class="progress-info">
                        <div class="class-name" id="float-class-name">加载中...</div>
                        <div class="score-info">
                            <span class="current-score" id="float-current-score">0</span>
                            <span class="score-separator">/</span>
                            <span class="required-score" id="float-required-score">0</span>
                            <span class="score-unit">学时</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" id="float-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
                <div class="log-section">
                    <div class="log-title">运行日志</div>
                    <div class="log-list" id="float-log-list">
                        <div class="log-item">等待日志...</div>
                    </div>
                </div>
            </div>
        `;

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            #auto-study-float {
                position: fixed;
                top: 20px;
                left: 20px;
                width: 320px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                overflow: hidden;
                transition: all 0.3s ease;
            }
            #auto-study-float.minimized .float-content {
                display: none;
            }
            #auto-study-float.minimized {
                width: 200px;
            }
            .float-header {
                background: rgba(0, 0, 0, 0.2);
                padding: 10px 15px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: move;
                user-select: none;
            }
            .float-title {
                color: white;
                font-size: 14px;
                font-weight: 600;
            }
            .float-toggle, .float-close {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
                transition: background 0.2s;
                margin-left: 5px;
            }
            .float-toggle:hover, .float-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            .float-content {
                padding: 15px;
                max-height: 500px;
                overflow-y: auto;
            }
            .user-section {
                background: rgba(255, 255, 255, 0.95);
                border-radius: 8px;
                padding: 12px 15px;
                margin-bottom: 12px;
            }
            .user-info {
                display: flex;
                align-items: baseline;
                gap: 4px;
            }
            .user-greeting {
                font-size: 14px;
                color: #666;
            }
            .user-name {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .progress-section {
                background: white;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 12px;
            }
            .progress-title {
                font-size: 12px;
                color: #666;
                margin-bottom: 8px;
                font-weight: 600;
            }
            .class-name {
                font-size: 13px;
                color: #333;
                margin-bottom: 8px;
                font-weight: 500;
            }
            .score-info {
                display: flex;
                align-items: baseline;
                margin-bottom: 8px;
            }
            .current-score {
                font-size: 24px;
                font-weight: 700;
                color: #667eea;
            }
            .score-separator {
                font-size: 18px;
                color: #999;
                margin: 0 4px;
            }
            .required-score {
                font-size: 18px;
                font-weight: 600;
                color: #666;
            }
            .score-unit {
                font-size: 12px;
                color: #999;
                margin-left: 4px;
            }
            .progress-bar {
                height: 8px;
                background: #f0f0f0;
                border-radius: 4px;
                overflow: hidden;
            }
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                border-radius: 4px;
                transition: width 0.5s ease;
            }
            .log-section {
                background: rgba(255, 255, 255, 0.95);
                border-radius: 8px;
                padding: 12px;
            }
            .log-title {
                font-size: 12px;
                color: #666;
                margin-bottom: 8px;
                font-weight: 600;
            }
            .log-list {
                max-height: 250px;
                overflow-y: auto;
                font-size: 11px;
            }
            .log-item {
                padding: 6px 8px;
                margin-bottom: 4px;
                background: rgba(0, 0, 0, 0.03);
                border-radius: 4px;
                border-left: 3px solid #667eea;
                line-height: 1.4;
            }
            .log-time {
                color: #999;
                margin-right: 6px;
                font-family: monospace;
            }
            .log-message {
                color: #333;
            }
            .log-list::-webkit-scrollbar {
                width: 6px;
            }
            .log-list::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }
            .log-list::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 3px;
            }
            .log-list::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(floatDiv);

        // 添加拖拽功能
        makeDraggable(floatDiv);

        // 添加最小化功能
        floatDiv.querySelector('.float-toggle').addEventListener('click', () => {
            floatDiv.classList.toggle('minimized');
            const btn = floatDiv.querySelector('.float-toggle');
            btn.textContent = floatDiv.classList.contains('minimized') ? '+' : '−';
        });

        // 添加关闭功能
        floatDiv.querySelector('.float-close').addEventListener('click', () => {
            floatDiv.style.display = 'none';
        });

        log('悬浮窗口已创建');
    }

    // 使元素可拖拽
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = element.querySelector('.float-header');

        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = "auto";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // 更新悬浮窗口
    function updateFloatingWindow() {
        const floatDiv = document.getElementById('auto-study-float');
        if (!floatDiv) return;

        // 更新用户信息
        const userNameEl = document.getElementById('float-user-name');
        if (STATE.userName && userNameEl) {
            userNameEl.textContent = STATE.userName;
        }

        // 更新进度信息
        const classNameEl = document.getElementById('float-class-name');
        const currentScoreEl = document.getElementById('float-current-score');
        const requiredScoreEl = document.getElementById('float-required-score');
        const progressFillEl = document.getElementById('float-progress-fill');

        if (STATE.className) {
            classNameEl.textContent = STATE.className;
        }

        currentScoreEl.textContent = STATE.currentScore;
        requiredScoreEl.textContent = STATE.requiredScore;

        // 更新进度条
        const progress = STATE.requiredScore > 0
            ? Math.min((STATE.currentScore / STATE.requiredScore) * 100, 100)
            : 0;
        progressFillEl.style.width = progress.toFixed(1) + '%';

        // 更新日志列表
        const logListEl = document.getElementById('float-log-list');
        if (STATE.logs.length > 0) {
            logListEl.innerHTML = STATE.logs.map(log => `
                <div class="log-item">
                    <span class="log-time">${log.time}</span>
                    <span class="log-message">${log.message}</span>
                </div>
            `).join('');
            // 自动滚动到底部
            logListEl.scrollTop = logListEl.scrollHeight;
        }
    }

    // 更新状态并刷新窗口
    function updateState(currentScore, requiredScore, className, userName) {
        if (currentScore !== undefined) STATE.currentScore = currentScore;
        if (requiredScore !== undefined) STATE.requiredScore = requiredScore;
        if (className !== undefined) STATE.className = className;
        if (userName !== undefined) STATE.userName = userName;
        updateFloatingWindow();
    }

    // ==================== URL参数和页面类型 ====================

    // 获取URL参数
    function getUrlParam(name) {
        const url = new URL(window.location.href);
        const hash = url.hash;
        const queryString = hash.includes('?') ? hash.split('?')[1] : '';
        const params = new URLSearchParams(queryString);
        return params.get(name);
    }

    // 判断当前页面类型
    function getPageType() {
        const hash = window.location.hash;
        if (hash.includes('/trainingClass/classDetail')) {
            return 'classDetail';
        } else if (hash.includes('/play/play')) {
            return 'videoPlay';
        }
        return 'other';
    }

    // ==================== 班级详情页面功能 ====================

    // 获取班级ID
    function getClassId() {
        return getUrlParam('Id');
    }

    // 获取学时信息（通过API）
    async function fetchClassDetail(classId) {
        try {
            const response = await fetch('/api/Page/ClassDetail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: `titleNav=培训班详情&page=1&rows=9&sort=Id&order=desc&Id=${classId}`
            });
            const data = await response.json();
            if (data.Status === 200) {
                return {
                    currentScore: data.Data.StudyScore,
                    requiredScore: data.Data.Model.RequiredCredit,
                    className: data.Data.Model.Name
                };
            }
        } catch (e) {
            log('获取班级详情失败: ' + e.message);
        }
        return null;
    }

    // 获取课程列表（通过API）
    async function fetchCourseList(classId, page = 1, rows = 100) {
        try {
            const response = await fetch('/api/Page/ClassCourse', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: `page=${page}&rows=${rows}&sort=Sort&order=desc&titleNav=班级课程&wordLimt=30&Id=${classId}&BigTypeName=`
            });
            const data = await response.json();
            if (data.Status === 200) {
                return data.Data.ListData;
            }
        } catch (e) {
            log('获取课程列表失败: ' + e.message);
        }
        return [];
    }

    // 找到第一个未完成的课程
    function findIncompleteCourse(courses) {
        for (const course of courses) {
            if (course.BrowseScore < 100) {
                return course;
            }
        }
        return null;
    }

    // 跳转到视频播放页面
    function navigateToVideo(courseId, classId) {
        const url = `/#/play/play?Id=${courseId}&classId=${classId}`;
        log(`跳转到课程: ${courseId}`);
        window.location.href = url;
    }

    // 班级详情页主逻辑
    async function handleClassDetailPage() {
        const classId = getClassId();
        if (!classId) {
            log('无法获取班级ID');
            return;
        }

        log(`当前班级ID: ${classId}`);

        // 获取学时信息
        const classDetail = await fetchClassDetail(classId);
        if (!classDetail) {
            log('获取学时信息失败');
            return;
        }

        log(`班级: ${classDetail.className}`);
        log(`当前学时: ${classDetail.currentScore} / 目标学时: ${classDetail.requiredScore}`);

        // 更新悬浮窗口状态
        updateState(classDetail.currentScore, classDetail.requiredScore, classDetail.className);

        // 检查是否已达标
        if (classDetail.currentScore >= classDetail.requiredScore) {
            log('🎉 已达到目标学时，无需继续学习！');
            return;
        }

        // 获取课程列表
        const courses = await fetchCourseList(classId);
        if (courses.length === 0) {
            log('课程列表为空');
            return;
        }

        log(`共${courses.length}门课程`);

        // 找到未完成的课程
        const incompleteCourse = findIncompleteCourse(courses);
        if (!incompleteCourse) {
            log('所有课程已完成');
            return;
        }

        log(`找到未完成课程: ${incompleteCourse.Name} (进度: ${incompleteCourse.BrowseScore}%)`);

        // 保存要播放的课程信息到sessionStorage
        const courseToPlay = {
            courseId: incompleteCourse.Id,
            classId: classId,
            timestamp: Date.now()
        };

        // 检查是否刚刚刷新过页面（10秒内）
        const savedCourse = sessionStorage.getItem('courseToPlay');
        if (savedCourse) {
            const saved = JSON.parse(savedCourse);
            // 如果是同一个课程且在10秒内，直接跳转
            if (saved.courseId === incompleteCourse.Id && (Date.now() - saved.timestamp) < 15000) {
                log('页面已刷新，等待10秒后跳转到视频...');
                setTimeout(() => {
                    sessionStorage.removeItem('courseToPlay');
                    navigateToVideo(incompleteCourse.Id, classId);
                }, 10000);
                return;
            }
        }

        // 保存课程信息并刷新页面
        sessionStorage.setItem('courseToPlay', JSON.stringify(courseToPlay));
        log('刷新页面以重置状态...');
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }

    // ==================== 视频播放页面功能 ====================

    let videoCheckTimer = null;
    let popupCheckTimer = null;
    let completeCheckCount = 0;  // 连续检测到完成的次数
    let lastProgress = -1;  // 上一次的进度
    let progressUnchangedCount = 0;  // 进度未变化的次数

    // 获取视频元素
    function getVideoElement() {
        return document.querySelector('video');
    }

    // 点击视频中间位置
    function clickVideoCenter() {
        const video = getVideoElement();
        if (!video) return;

        try {
            const rect = video.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            log(`点击视频中心位置 (${Math.round(centerX)}, ${Math.round(centerY)})`);

            // 创建点击事件
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: centerX,
                clientY: centerY
            });

            // 直接点击视频元素
            video.click();

            // 也触发事件到坐标位置
            const element = document.elementFromPoint(centerX, centerY);
            if (element) {
                element.dispatchEvent(clickEvent);
            }
        } catch (e) {
            log('点击视频中心失败: ' + e.message);
        }
    }

    // 确保视频播放（避免频繁调用）
    let lastPlayAttempt = 0;
    async function ensureVideoPlaying() {
        const video = getVideoElement();
        if (!video || !video.paused) {
            return;  // 视频不存在或正在播放，无需操作
        }

        // 避免频繁尝试（每5秒最多尝试一次）
        const now = Date.now();
        if (now - lastPlayAttempt < 5000) {
            return;
        }
        lastPlayAttempt = now;

        log('视频暂停，尝试恢复播放...');

        try {
            await video.play();
            log('✅ 视频恢复播放成功');
        } catch (e) {
            log('⚠️ 播放失败: ' + e.message);
            log('尝试点击视频元素');
            // 点击视频元素
            video.click();

            // 等待一下，再尝试点击播放按钮
            setTimeout(() => {
                clickPlayButtonIfNeeded();
            }, 500);
        }
    }

    // 检查并处理弹窗
    function handlePopups() {
        // 方法1: 通用检测 - 查找页面上可见的"确定"按钮
        const allButtons = document.querySelectorAll('button, .btn, a');
        for (const btn of allButtons) {
            const text = btn.textContent.trim();
            if (text === '确定' && btn.offsetParent !== null) {
                // 检查按钮是否在弹窗中（不是普通页面按钮）
                const parent = btn.closest('.layui-layer, .modal, .el-message-box, [class*="dialog"], [class*="popup"], [class*="message"]');
                if (parent || btn.closest('[role="dialog"]')) {
                    log('检测到弹窗确定按钮，点击');
                    btn.click();
                    return true;
                }
            }
        }

        // 方法2: 检测包含"点击进行验证"文字的元素
        const bodyText = document.body.innerText;
        if (bodyText.includes('点击进行验证')) {
            // 查找确定按钮
            for (const btn of allButtons) {
                if (btn.textContent.trim() === '确定' && btn.offsetParent !== null) {
                    log('检测到验证弹窗，点击确定');
                    btn.click();
                    return true;
                }
            }
        }

        // 方法3: layui弹窗
        const layuiBtn = document.querySelector('.layui-layer-btn0');
        if (layuiBtn && layuiBtn.offsetParent !== null) {
            log('点击layui弹窗确定按钮');
            layuiBtn.click();
            return true;
        }

        // 方法4: 课间小测验弹窗
        const questionModal = document.querySelector('.questionModal');
        if (questionModal && (questionModal.classList.contains('in') || questionModal.classList.contains('show'))) {
            log('检测到课间小测验弹窗');
            const confirmBtn = questionModal.querySelector('.btn-primary, .btn-confirm, button');
            if (confirmBtn) {
                log('点击确定按钮');
                confirmBtn.click();
                return true;
            }
        }

        // 方法5: Element UI弹窗
        const elMessageBox = document.querySelector('.el-message-box');
        if (elMessageBox && getComputedStyle(elMessageBox).display !== 'none') {
            const confirmBtn = elMessageBox.querySelector('.el-button--primary, .el-message-box__btns button');
            if (confirmBtn) {
                log('点击Element弹窗确定按钮');
                confirmBtn.click();
                return true;
            }
        }

        // 处理Bootstrap模态框（通用）
        const visibleModal = document.querySelector('.modal.in, .modal.show');
        if (visibleModal) {
            const confirmBtn = visibleModal.querySelector('.modal-footer .btn-primary, .modal-footer button');
            if (confirmBtn) {
                log('点击模态框确定按钮');
                confirmBtn.click();
                return true;
            }
        }

        return false;
    }

    // 检查视频是否播放完成
    function isVideoComplete() {
        const video = getVideoElement();
        if (!video) return false;

        // 检查视频是否结束
        if (video.ended) return true;

        // 检查是否接近结尾（最后2秒）
        if (video.duration > 0 && (video.duration - video.currentTime) < 2) {
            return true;
        }

        return false;
    }

    // 返回班级详情页并刷新
    function returnToClassDetail() {
        const classId = getUrlParam('classId');
        if (classId) {
            log(`返回班级详情页，班级ID: ${classId}`);
            window.location.href = `/#/trainingClass/classDetail?Id=${classId}`;
        } else {
            log('无法获取classId，使用浏览器后退');
            window.history.back();
        }
    }

    // 智能点击播放按钮（只在视频暂停时点击一次）
    function clickPlayButtonIfNeeded() {
        const video = getVideoElement();
        if (!video || !video.paused) {
            return;  // 视频正在播放，不需要点击
        }

        // 查找播放按钮
        const playButtonSelectors = [
            'button[class*="play"]:not([class*="playing"])',
            'button[aria-label*="播放"]',
            'button[title*="播放"]',
            '.video-play-button',
            '.vjs-big-play-button'
        ];

        for (const selector of playButtonSelectors) {
            const button = document.querySelector(selector);
            if (button && button.offsetParent !== null) {
                log('找到播放按钮，尝试点击');
                button.click();
                return;  // 只点击一次就返回
            }
        }
    }

    // 视频播放页主逻辑
    function handleVideoPlayPage() {
        log('进入视频播放页面');

        // 等待视频加载
        let retryCount = 0;
        const waitForVideo = setInterval(() => {
            const video = getVideoElement();
            if (video) {
                clearInterval(waitForVideo);
                log('视频元素已加载');

                // 尝试自动播放
                setTimeout(async () => {
                    if (video.paused) {
                        log('尝试自动播放视频');
                        try {
                            await video.play();
                            log('✅ 自动播放成功');
                        } catch (e) {
                            log('⚠️ 自动播放失败: ' + e.message);
                            log('自动点击视频元素触发播放');

                            // 点击视频元素
                            video.click();

                            // 再次尝试播放
                            setTimeout(async () => {
                                try {
                                    await video.play();
                                    log('✅ 点击后播放成功');
                                } catch (retryError) {
                                    log('点击后仍然失败，尝试点击播放按钮');
                                    clickPlayButtonIfNeeded();
                                }
                            }, 300);
                        }
                    }
                }, 1000);

                startVideoMonitoring();
            } else {
                retryCount++;
                if (retryCount > 30) {
                    clearInterval(waitForVideo);
                    log('等待视频超时');
                }
            }
        }, 1000);
    }

    // 开始监控视频播放
    function startVideoMonitoring() {
        log('开始监控视频播放');

        // 重置所有计数器
        completeCheckCount = 0;
        lastProgress = -1;
        progressUnchangedCount = 0;

        // 确保视频播放
        ensureVideoPlaying();

        // 定期检查视频状态
        videoCheckTimer = setInterval(() => {
            const video = getVideoElement();
            if (!video) {
                log('视频元素丢失');
                return;
            }

            // 显示当前进度
            const progress = video.duration > 0 ? ((video.currentTime / video.duration) * 100).toFixed(1) : 0;
            log(`播放进度: ${progress}% (${Math.floor(video.currentTime)}s / ${Math.floor(video.duration)}s)`);

            // 检查进度是否停滞
            const currentProgress = parseFloat(progress);
            if (lastProgress >= 0 && Math.abs(currentProgress - lastProgress) < 0.1 && currentProgress < 99.5) {
                // 进度没有变化且不是100%
                progressUnchangedCount++;
                log(`⚠️ 进度未变化 (${progressUnchangedCount}/2)`);

                if (progressUnchangedCount >= 2) {
                    log('🔄 检测到视频停滞，点击视频中心尝试恢复');
                    clickVideoCenter();
                    progressUnchangedCount = 0;  // 重置计数器
                }
            } else {
                // 进度有变化，重置计数器
                if (progressUnchangedCount > 0) {
                    progressUnchangedCount = 0;
                }
            }
            lastProgress = currentProgress;

            // 确保视频在播放
            ensureVideoPlaying();

            // 检查进度是否达到100%
            if (currentProgress >= 99.5) {
                completeCheckCount++;
                log(`检测到播放完成 (${completeCheckCount}/3)`);

                // 连续3次都是100%才认为完成
                if (completeCheckCount >= 3) {
                    log('✅ 连续3次检测确认视频播放完成！');
                    stopVideoMonitoring();

                    // 等待一段时间后返回班级详情页
                    log(`等待 ${CONFIG.WAIT_AFTER_COMPLETE / 1000} 秒后返回班级详情页...`);
                    setTimeout(() => {
                        returnToClassDetail();
                    }, CONFIG.WAIT_AFTER_COMPLETE);
                }
            } else {
                // 如果进度不是100%，重置完成计数器
                if (completeCheckCount > 0) {
                    log(`播放进度未达到100%，重置完成计数器`);
                    completeCheckCount = 0;
                }
            }
        }, CONFIG.CHECK_INTERVAL);

        // 定期检查弹窗
        popupCheckTimer = setInterval(() => {
            handlePopups();
        }, CONFIG.POPUP_CHECK_INTERVAL);

        // 监听视频结束事件（浏览器原生事件，直接认为完成）
        const video = getVideoElement();
        if (video) {
            video.addEventListener('ended', () => {
                log('收到视频结束事件（浏览器原生）');
                log('✅ 视频播放完成！');
                stopVideoMonitoring();
                log(`等待 ${CONFIG.WAIT_AFTER_COMPLETE / 1000} 秒后返回班级详情页...`);
                setTimeout(() => {
                    returnToClassDetail();
                }, CONFIG.WAIT_AFTER_COMPLETE);
            });
        }
    }

    // 停止监控
    function stopVideoMonitoring() {
        if (videoCheckTimer) {
            clearInterval(videoCheckTimer);
            videoCheckTimer = null;
        }
        if (popupCheckTimer) {
            clearInterval(popupCheckTimer);
            popupCheckTimer = null;
        }
        // 重置所有计数器
        completeCheckCount = 0;
        lastProgress = -1;
        progressUnchangedCount = 0;
        log('停止视频监控');
    }

    // ==================== 主入口 ====================

    async function init() {
        log('脚本启动');

        // 创建悬浮窗口
        setTimeout(() => {
            createFloatingWindow();
        }, 500);

        // 获取用户信息
        setTimeout(async () => {
            const userName = await fetchUserInfo();
            if (userName) {
                log(`当前用户: ${userName}`);
                updateState(undefined, undefined, undefined, userName);
            }
        }, 1000);

        // 等待页面加载完成
        setTimeout(() => {
            const pageType = getPageType();
            log(`当前页面类型: ${pageType}`);

            switch (pageType) {
                case 'classDetail':
                    handleClassDetailPage();
                    break;
                case 'videoPlay':
                    handleVideoPlayPage();
                    break;
                default:
                    log('非目标页面，脚本不执行');
            }
        }, 2000);
    }

    // 监听hash变化（SPA应用）
    window.addEventListener('hashchange', () => {
        log('检测到页面切换');
        stopVideoMonitoring();
        setTimeout(init, 1000);
    });

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
