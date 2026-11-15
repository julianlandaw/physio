/* Copyright (c) 2026 Julian W. Landaw | SPDX-License-Identifier: MIT */
// Keep bookmarked mode pages and their shared settings working in the one app.
const destination = new URL('ventilator_simulator.html', location.href);
destination.search = location.search;
destination.searchParams.set('mode', document.body.dataset.ventilationMode);
destination.hash = location.hash;
location.replace(destination.href);
