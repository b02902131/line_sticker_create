# Refactor Handoff
iteration: 1
done: CropAdjustPanel extracted to src/components/CropAdjustPanel.jsx
next: TabCropper (lines 20–205 in original App.jsx, now lines 20–205 after removal of CropAdjustPanel — still the first inline component before App())
notes: useCallback was used only for handleWheel inside CropAdjustPanel, but App.jsx itself also uses useCallback extensively so the import did not need to be removed. Both TabCropper and CropAdjustPanel were top-level functions in App.jsx (not nested inside App), so extraction was straightforward with no closure captures from App scope.
