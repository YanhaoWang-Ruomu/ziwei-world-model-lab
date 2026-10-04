These four OCR models are public Apache-2.0 Tesseract tessdata_best assets,
vendored for same-origin browser OCR without third-party model requests.

Source commit: e12c65a915945e4c28e237a9b52bc4a8f39a0cec
https://github.com/tesseract-ocr/tessdata_best/tree/e12c65a915945e4c28e237a9b52bc4a8f39a0cec

- chi_tra.traineddata SHA-256: 1aa60488574cafa69486d919284f079ca9b68fcc7f6ad8dc1ff1b318dfd97028
- chi_tra_vert.traineddata SHA-256: bbe518f94b9e3852109113507357bfe7e257834d88d2d1ead44178046bcd2181
- chi_sim.traineddata SHA-256: 4fef2d1306c8e87616d4d3e4c6c67faf5d44be3342290cf8f2f0f6e3aa7e735b
- chi_sim_vert.traineddata SHA-256: ea672a78157199c333aa12ec4e74550077689b545df5fc770903716850c8b2e5

The uploader selects Traditional, Simplified or both models and vertical or
horizontal layout. Raw output preserves the recognized glyphs. OpenCC is only
used for the search index, not for rewriting source text. OCR runs in the browser;
no paid AI inference API is called.

The browser uses the non-SIMD LSTM core after an actual browser test found
a missing DotProductSSE function in the automatically selected v7 SIMD build.
Source book OCR is unreviewed. A successful import never means character-perfect transcription.
