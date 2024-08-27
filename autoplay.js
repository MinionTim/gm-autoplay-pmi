// ==UserScript==
// @name         Auto Play On-Demand Webinars - PMI
// @namespace    http://tampermonkey.net/
// @version      2024-08-19
// @description  auto play videos on pmi, to earn pdus.
// @author       ville.zeng
// @match        *://www.projectmanagement.com/webinars/webinarmainondemand.cfm*
// @match        *://www.projectmanagement.com/videos/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11.10.4/dist/sweetalert2.all.min.js
// @resource     css https://cdn.jsdelivr.net/npm/sweetalert2@11.10.4/dist/sweetalert2.min.css
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow

// ==/UserScript==

(function() {
    'use strict';

    // 引入第三方库https://github.com/sweetalert2/sweetalert2/
	GM_addStyle(GM_getResourceText("css"));
    // 弹窗函数
	function toast(title, text=null, delay_ms = 2000) {
        log('[TOAST] title: ' + title + ', text: ' + text + '.')
		Swal.fire({
			title: title,
            text: text,
			position: "top-end",
			//icon: "success",
			showConfirmButton: false,
			timer: delay_ms
		})
	}

    function gmGetValue(key, defaultValue = undefined) {
        return GM_getValue(key, defaultValue);
    }
    function gmSetValueAndReturn(key, value) {
        GM_setValue(key, value);
        return value;
    }

    function gmDeleteValueAndReturn(key) {
        GM_deleteValue(key)
        return undefined
    }

    let $ = unsafeWindow.jQuery;
    let task_total = gmGetValue('pmi_task_total');
    let task_start = gmGetValue('pmi_task_start_from');
    let task_current = gmGetValue('pmi_task_current');
    // 需要打开的URL列表
    let urls = [];
    // 每个标签页打开的最长时间（毫秒）
    const maxOpenTime = 70 * 60 * 1000;
    let tabTimers = {};
    let currentTab = null;

    function formatCurrentTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[' + formatCurrentTime() + ']', "[GMonkey]");
        console.log.apply(console, args);
    }

    function fetchUrls(){
        log('fetchUrls')
        var links = $('h4.videos:has(a)').find('a').map(function() {
            return $(this).attr('href');
        }).get();
        return links;
    }

    // index 从零开始
    function openNextTab(index) {
        if (index < urls.length) {
            const url = urls[index];
            log('open tab, index = ' + index + '. url = ' + url)
            if (currentTab) {
                if (currentTab.closed) {
                    Swal.fire({
                        title: 'The PLAYING tab has been closed abnormally!',
                        position: "center",
                        icon: "error",
                        allowOutsideClick: false
                    })
                    return
                }
                currentTab.postMessage({ action: 'actionNextUrl', url: url }, '*');
            } else {
                currentTab = window.open(url)
                window.addEventListener('message', onMessageCallback);
            }
            task_current = gmSetValueAndReturn('pmi_task_current', index + 1);

            const timer = setTimeout(() => {
                log('video played timeout, auto play next video. tab index: ' + index)
                clearTimeout(timer);
                openNextTab(index + 1);
            }, maxOpenTime);

            tabTimers[index] = timer;
        } else {
            Swal.fire({
                title: '播放任务全部完成!!!',
                position: "center",
                icon: "success",
                allowOutsideClick: false
            })
        }
    }

    function onMessageCallback(event) {
        if (event.data && event.data.action === 'actionVideoEnded') {
            log('onMessage: action = ' + event.data.action + ', url = ' + event.data.url)
            const index = urls.indexOf(event.data.url)
            clearTimeout(tabTimers[index]);
            openNextTab(index + 1);
        }
    }

    function showSettingsPanel(){
        if (task_total && task_start) {
            Swal.fire({
                title: '任务状态',
                text: `当前正在执行任务，任务进度 ${task_current}/${task_total}`,
                showCancelButton: true,
                confirmButtonText: '终止任务',
                cancelButtonText: '取消'
            }).then((result) => {
                if (result.isConfirmed) {
                    // 终止任务的逻辑
                    console.log('终止任务');
                    task_total = gmDeleteValueAndReturn('pmi_task_total');
                    task_start = gmDeleteValueAndReturn('pmi_task_start_from');
                    task_current = gmDeleteValueAndReturn('pmi_task_current');
                }
            });
        } else {
            // 如果 running_status 不存在，显示输入框让用户输入任务信息
            Swal.fire({
                title: '创建自动播放任务',
                html: `
                <label for="task-total" style="font-size: 12px; display: inline-block; width: 100px;">总任务数量:</label>
                <input id="task-total" class="swal2-input" placeholder="请输入总视频数量" type="number" style="font-size: 12px; height: 20px; padding: 5px; display: inline-block; width: 200px;">
                <br>
                <label for="task-start" style="font-size: 12px; display: inline-block; width: 100px;">从第几个开始:</label>
                <input id="task-start" class="swal2-input" placeholder="请输入开始任务序号" type="number" style="font-size: 12px; height: 20px; padding: 5px; display: inline-block; width: 200px;">
            `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: '开始',
                cancelButtonText: '取消',
                preConfirm: () => {
                    const taskTotal = document.getElementById('task-total').value;
                    const taskStart = document.getElementById('task-start').value;

                    if (!taskTotal || !taskStart || parseInt(taskTotal) <= 0 || parseInt(taskStart) <= 0) {
                        Swal.showValidationMessage('请输入数据有误');
                        return false;
                    }

                    return {
                        taskTotal: taskTotal,
                        taskStart: taskStart
                    };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const { taskTotal, taskStart } = result.value;
                    task_total = gmSetValueAndReturn('pmi_task_total', taskTotal);
                    task_start = gmSetValueAndReturn('pmi_task_start_from', taskStart);
                    console.log('开始任务: task_total: ' + task_total + ', task_start: ' + task_start);
                    setTimeout(() => {
                        prepareVideoList()
                    }, 2000)
                }
            });
        }
    }

    function prepareVideoList(){
        urls.push(...fetchUrls())
        if ((urls.length - task_start) < task_total) {
            $('.pagerItems').filter(function() {
                return $(this).text().trim() === 'next';
            }).click();
        } else {
            urls.splice(0, task_start);
            if (urls.length > task_total) {
                urls.splice(task_total - urls.length);
            }
            log('Start All Task. task_total: ' + task_total + ', task_start_from: ' + task_start + '. urls: ' + urls)
            openNextTab(0);
        }
    }

    function addSettingsPanel(){
        const button = document.createElement('button');
        button.textContent = '油猴脚本，点我查看';
        button.style.position = 'fixed';
        button.style.right = '5px';  // 距离右侧边距
        button.style.top = '22%';    // 距离顶部的距离
        button.style.transform = 'translateY(-50%)';
        button.style.zIndex = '1000';  // 确保按钮在其他元素之上
        button.style.padding = '10px 20px';
        button.style.backgroundColor = '#007bff';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        button.style.aria_hidden = 'true';

        // 将按钮添加到页面上
        document.body.appendChild(button);

        button.addEventListener('click', function() {
            showSettingsPanel()
        });
    }

    function initPageContentChangedListener() {
        // 监听页面某个容器的 DOM 变化
        const targetNode = document.getElementById('resultsColumn');
        const observerConfig = { childList: true, subtree: true };
        let timeoutId;

        const observer = new MutationObserver((mutationsList, observer) => {
            for (let mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    if (mutation.target.matches('#resultsColumn')) {
                        let currentPage = $('#pagerSpan font').filter(function() {
                            return !$(this).is('a[href]');
                        }).text()
                        log('页面数据刷新完成, 页码: ' + currentPage);
                        setTimeout(() => {
                            prepareVideoList();
                        }, 1000)
                    }
                    break;
                }
            }
        });

        // 开始观察
        observer.observe(targetNode, observerConfig);
    }

    function autoPlay() {
        const video = document.querySelector('.vjs-tech');
        log('laod complete... video start with muted')
        video.muted = true
        video.play()

        video.addEventListener('ended', function() {
            toast('Play complete.');
            setTimeout(function() {
                const relativeUrl = window.location.pathname + window.location.search
                window.opener && window.opener.postMessage({ action: 'actionVideoEnded', url: relativeUrl }, '*');
            }, 4000);
        });

        window.addEventListener('message', function(event) {
            if (event.data && event.data.action === 'actionNextUrl') {
                const url = event.data.url
                log('onMessage: action = ' + event.data.action + ', start to open url: ' + event.data.url)
                toast('Go to Next One', url)
                setTimeout(function() {
                    window.location.href = url;
                }, 3000);
            }
        });


    }
    function mainStart() {
        addSettingsPanel();
        const url = window.location.href;
        if (url.includes('//www.projectmanagement.com/webinars/webinarmainondemand.cfm')) {
            initPageContentChangedListener();
            setTimeout(() => {
                showSettingsPanel()
            }, 2000)
        } else if (url.includes('//www.projectmanagement.com/videos/')) {
            autoPlay()
        } else {
            log('error', 'url not definded.')
        }

    }

    window.addEventListener('load', function() {
        mainStart()
    }, { once: true });

})();