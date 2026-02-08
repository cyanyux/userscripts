// ==UserScript==
// @name         Coursera Subtitle Toggle (C key)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Press C to toggle subtitles on/off on Coursera video lectures
// @match        https://www.coursera.org/learn/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function toggleSubtitles() {
        const video = document.querySelector('video');
        if (!video || !video.textTracks || video.textTracks.length === 0) return;

        const tracks = video.textTracks;
        let anyShowing = false;
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].mode === 'showing') {
                anyShowing = true;
                break;
            }
        }

        if (anyShowing) {
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].mode = 'disabled';
            }
        } else {
            let englishTrack = null;
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].language === 'en') {
                    englishTrack = tracks[i];
                    break;
                }
            }
            (englishTrack || tracks[0]).mode = 'showing';
        }
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'c' || e.key === 'C') {
            const tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            e.preventDefault();
            toggleSubtitles();
        }
    });
})();
