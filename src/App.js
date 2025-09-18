import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import {Box, Text, useApp, useInput, useStdout, useStdin} from 'ink';
import AdvancedTextInput from './components/AdvancedTextInput.js';
import {
  detectDefaultStorageMode,
  loadTodos,
  readConfig,
  saveTodos,
  STORAGE_MODES,
  writeConfig
} from './storage.js';

const h = React.createElement;

const DEFAULT_STATUS = {
  tone: 'muted',
  text: 'Press `a` to add a todo. Type `?` anytime for help.'
};

const STATUS_TONES = {
  muted: 'gray',
  info: 'cyan',
  success: 'green',
  warning: 'yellow',
  danger: 'red'
};

const EXIT_CONFIRM_TIMEOUT = 2000;
const MIN_LIST_HEIGHT = 6;
const HELP_SHORTCUT = '?';

const MODES = {
  VIEW: 'view',
  ADD: 'add',
  EDIT: 'edit',
  SETTINGS: 'settings',
  HELP: 'help'
};

const storageDescriptions = {
  [STORAGE_MODES.GLOBAL]: 'Great for personal lists that travel with you',
  [STORAGE_MODES.PROJECT]: 'Keeps todos right beside the current project'
};

function randomId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '—';
  }

  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    return timestamp;
  }
}

function sanitizeTasks(rawTasks = []) {
  const seen = new Set();

  return rawTasks
    .filter(task => task && typeof task.title === 'string')
    .map(task => {
      const id = typeof task.id === 'string' && task.id.trim().length > 0 ? task.id : randomId();
      const safeId = seen.has(id) ? `${id}-${randomId()}` : id;
      seen.add(safeId);

      const createdAt = task.createdAt || new Date().toISOString();
      const done = Boolean(task.done);
      const completedAt = done ? task.completedAt || new Date().toISOString() : null;

      return {
        id: safeId,
        title: task.title.trim(),
        done,
        createdAt,
        completedAt
      };
    });
}

function createSnapshot({tasks, storageMode, selectedId}) {
  const clonedTasks = tasks.map(task => ({...task}));
  const hasSelection = clonedTasks.some(task => task.id === selectedId);
  const effectiveSelectedId = hasSelection ? selectedId : clonedTasks[0]?.id ?? null;

  return {
    tasks: clonedTasks,
    storageMode,
    selectedId: effectiveSelectedId
  };
}

function historyReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return {
        past: [],
        present: createSnapshot(action.payload),
        future: []
      };
    case 'COMMIT':
      return {
        past: [...state.past, state.present],
        present: createSnapshot(action.payload),
        future: []
      };
    case 'SET_PRESENT':
      return {
        ...state,
        present: createSnapshot({...state.present, ...action.payload})
      };
    case 'UNDO': {
      if (state.past.length === 0) {
        return state;
      }

      const previous = state.past[state.past.length - 1];
      const past = state.past.slice(0, -1);

      return {
        past,
        present: previous,
        future: [state.present, ...state.future]
      };
    }
    case 'REDO': {
      if (state.future.length === 0) {
        return state;
      }

      const [next, ...rest] = state.future;

      return {
        past: [...state.past, state.present],
        present: next,
        future: rest
      };
    }
    default:
      return state;
  }
}

function deriveInitialHistory() {
  const storageMode = detectDefaultStorageMode();
  const {items, error} = loadTodos(storageMode);
  const tasks = sanitizeTasks(items);
  const present = createSnapshot({tasks, storageMode, selectedId: tasks[0]?.id ?? null});

  return {
    history: {
      past: [],
      present,
      future: []
    },
    initialError: error
  };
}

function computeVisibleWindow(tasks, selectedIndex, targetSize) {
  if (tasks.length === 0) {
    return {
      start: 0,
      end: 0,
      window: []
    };
  }

  const size = Math.max(MIN_LIST_HEIGHT, targetSize);
  const clampedIndex = Math.max(0, Math.min(selectedIndex, tasks.length - 1));
  const half = Math.floor(size / 2);
  const start = Math.max(0, clampedIndex - half);
  const end = Math.min(tasks.length, start + size);
  const adjustedStart = Math.max(0, end - size);

  return {
    start: adjustedStart,
    end,
    window: tasks.slice(adjustedStart, end)
  };
}

const toneToColor = tone => STATUS_TONES[tone] ?? STATUS_TONES.info;

const storagePathLabel = mode => {
  if (mode === STORAGE_MODES.GLOBAL) {
    return '~/.ink-notex/todos.json';
  }

  return './.ink-notex-todos.json';
};

const useTerminalHeight = (fallback = 24) => {
  const {stdout} = useStdout();
  const [height, setHeight] = useState(() => stdout?.rows ?? fallback);

  useEffect(() => {
    if (!stdout) {
      return;
    }

    const handleResize = () => {
      setHeight(stdout.rows);
    };

    handleResize();
    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return height ?? fallback;
};

const App = () => {
  const {exit} = useApp();
  const {history: initialHistory, initialError} = useMemo(() => deriveInitialHistory(), []);
  const [history, dispatchHistory] = useReducer(historyReducer, initialHistory);
  const [uiMode, setUiMode] = useState(MODES.VIEW);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState(null);
  const [status, setStatus] = useState(() =>
    initialError
      ? {tone: 'danger', text: `Failed to load todos: ${initialError.message}`}
      : DEFAULT_STATUS
  );
  const statusTimerRef = useRef(null);
  const ctrlCRef = useRef({timer: null, lastPress: undefined, lastSource: null});
  const terminalHeight = useTerminalHeight();
  const [storageError, setStorageError] = useState(initialError);
  const rawModeNoticeRef = useRef(false);
  const {isRawModeSupported, setRawMode} = useStdin();

  const present = history.present;
  const tasks = present.tasks;
  const storageMode = present.storageMode;
  const selectedId = present.selectedId;
  const selectedIndex = useMemo(
    () => tasks.findIndex(task => task.id === selectedId),
    [tasks, selectedId]
  );

  const hasTasks = tasks.length > 0;
  const activeSelectionIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selectedTask = hasTasks ? tasks[activeSelectionIndex] : null;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const showStatus = useCallback((text, tone = 'info', duration = 2500) => {
    setStatus({text, tone});

    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    if (duration) {
      statusTimerRef.current = setTimeout(() => {
        setStatus(DEFAULT_STATUS);
        statusTimerRef.current = null;
      }, duration);
    }
  }, []);

  useEffect(() => {
    if (isRawModeSupported && typeof setRawMode === 'function') {
      setRawMode(true);
      return () => {
        setRawMode(false);
      };
    }

    if (!rawModeNoticeRef.current) {
      rawModeNoticeRef.current = true;
      showStatus(
        'Terminal does not support raw mode; Ctrl+C will exit immediately.',
        'warning',
        4000
      );
    }

    return undefined;
  }, [isRawModeSupported, setRawMode, showStatus]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }

      if (ctrlCRef.current.timer) {
        clearTimeout(ctrlCRef.current.timer);
      }
    };
  }, []);

  useEffect(() => {
    const error = saveTodos(storageMode, tasks);
    setStorageError(error);

    if (error) {
      setStatus({tone: 'danger', text: `Unable to save todos: ${error.message}`});
    }
  }, [storageMode, tasks]);

  useEffect(() => {
    const config = readConfig();
    const nextConfig = {...config, storageMode};
    writeConfig(nextConfig);
  }, [storageMode]);

  useEffect(() => {
    if (selectedIndex === -1 && tasks.length > 0) {
      dispatchHistory({type: 'SET_PRESENT', payload: {selectedId: tasks[0].id}});
    }
  }, [selectedIndex, tasks]);

  const confirmExit = useCallback((source = 'ctrl+c') => {
    const now = Date.now();
    const state = ctrlCRef.current;

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.lastPress && now - state.lastPress <= EXIT_CONFIRM_TIMEOUT) {
      exit();
      return;
    }

    state.lastPress = now;
    state.lastSource = source;
    state.timer = setTimeout(() => {
      ctrlCRef.current = {timer: null, lastPress: undefined, lastSource: null};
    }, EXIT_CONFIRM_TIMEOUT);
    const label = source === 'q' ? 'q' : 'Ctrl+C';
    showStatus(`Press ${label} again to exit safely.`, 'warning', 2000);
  }, [exit, showStatus]);

  const commitSnapshot = useCallback(
    next => {
      dispatchHistory({type: 'COMMIT', payload: next});
    },
    [dispatchHistory]
  );

  const selectByIndex = useCallback(
    index => {
      if (!hasTasks) {
        return;
      }

      const normalizedIndex = Math.max(0, Math.min(index, tasks.length - 1));
      const target = tasks[normalizedIndex];

      if (target) {
        dispatchHistory({type: 'SET_PRESENT', payload: {selectedId: target.id}});
      }
    },
    [dispatchHistory, hasTasks, tasks]
  );

  const moveSelection = useCallback(
    delta => {
      if (!hasTasks) {
        return;
      }

      const index = selectedIndex >= 0 ? selectedIndex : 0;
      const nextIndex = (index + delta + tasks.length) % tasks.length;
      selectByIndex(nextIndex);
    },
    [hasTasks, selectByIndex, selectedIndex, tasks]
  );

  const handleAddSubmit = useCallback(() => {
    const title = draft.trim();

    if (title.length === 0) {
      showStatus('Todo cannot be empty.', 'warning');
      return;
    }

    const now = new Date().toISOString();
    const newTask = {
      id: randomId(),
      title,
      done: false,
      createdAt: now,
      completedAt: null
    };

    const nextTasks = [...tasks, newTask];

    commitSnapshot({
      tasks: nextTasks,
      storageMode,
      selectedId: newTask.id
    });

    setDraft('');
    showStatus('Todo added. Enter another or press Esc to return.', 'success', 2500);
  }, [commitSnapshot, draft, showStatus, storageMode, tasks]);

  const handleToggle = useCallback(() => {
    if (!hasTasks) {
      return;
    }

    const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const targetTask = tasks[targetIndex];

    if (!targetTask) {
      return;
    }

    const done = !targetTask.done;
    const now = new Date().toISOString();

    const nextTasks = tasks.map((task, index) =>
      index === targetIndex
        ? {...task, done, completedAt: done ? now : null}
        : task
    );

    commitSnapshot({
      tasks: nextTasks,
      storageMode,
      selectedId
    });

    showStatus(done ? 'Marked complete.' : 'Marked pending.', 'success');
  }, [commitSnapshot, hasTasks, selectedId, selectedIndex, showStatus, storageMode, tasks]);

  const handleDelete = useCallback(() => {
    if (!hasTasks) {
      return;
    }

    const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const removedTask = tasks[targetIndex];

    if (!removedTask) {
      return;
    }

    const nextTasks = tasks.filter((_, index) => index !== targetIndex);
    const nextSelectedId = nextTasks.length === 0
      ? null
      : nextTasks[Math.min(targetIndex, nextTasks.length - 1)].id;

    commitSnapshot({
      tasks: nextTasks,
      storageMode,
      selectedId: nextSelectedId
    });

    showStatus('Todo deleted. Undo with Ctrl+Z.', 'info');
  }, [commitSnapshot, hasTasks, selectedIndex, showStatus, storageMode, tasks]);

  const startAddMode = useCallback(() => {
    setUiMode(MODES.ADD);
    setDraft('');
    showStatus('Add todos. Press Esc to return to the list.', 'info');
  }, []);

  const startEditMode = useCallback(() => {
    if (!hasTasks) {
      return;
    }

    const target = selectedTask || tasks[0];

    if (!target) {
      return;
    }

    setEditId(target.id);
    setDraft(target.title);
    setUiMode(MODES.EDIT);
    showStatus('Editing todo. Enter to save, Esc to cancel.', 'info');
  }, [hasTasks, selectedTask, tasks]);

  const handleEditSubmit = useCallback(() => {
    if (!editId) {
      return;
    }

    const title = draft.trim();

    if (title.length === 0) {
      showStatus('Todo cannot be empty.', 'warning');
      return;
    }

    const currentTask = tasks.find(task => task.id === editId);

    if (!currentTask) {
      setUiMode(MODES.VIEW);
      return;
    }

    if (currentTask.title === title) {
      setUiMode(MODES.VIEW);
      setDraft('');
      return;
    }

    const nextTasks = tasks.map(task =>
      task.id === editId ? {...task, title} : task
    );

    commitSnapshot({
      tasks: nextTasks,
      storageMode,
      selectedId: editId
    });

    setUiMode(MODES.VIEW);
    setDraft('');
    setEditId(null);
    showStatus('Todo updated.', 'success');
  }, [commitSnapshot, draft, editId, showStatus, storageMode, tasks]);

  const openSettings = useCallback(() => {
    setUiMode(MODES.SETTINGS);
    showStatus('Use ↑ ↓ to choose storage. Enter to apply. Esc to cancel.', 'info');
  }, []);

  const openHelp = useCallback(() => {
    setUiMode(MODES.HELP);
    showStatus('Help opened. Press Esc to close.', 'info');
  }, []);

  const applyStorageMode = useCallback(
    nextMode => {
      if (nextMode === storageMode) {
        return;
      }

      const {items, error} = loadTodos(nextMode);
      const nextTasks = sanitizeTasks(items);
      const snapshot = {
        tasks: nextTasks,
        storageMode: nextMode,
        selectedId: nextTasks[0]?.id ?? null
      };

      commitSnapshot(snapshot);

      if (error) {
        setStorageError(error);
        showStatus(`Switched storage, but loading failed: ${error.message}`, 'danger', 4000);
      } else {
        setStorageError(null);
        showStatus(`Storage switched to ${nextMode}.`, 'success');
      }
    },
    [commitSnapshot, showStatus, storageMode]
  );

  const undo = useCallback(() => {
    if (!canUndo) {
      return;
    }

    dispatchHistory({type: 'UNDO'});
    showStatus('Undid last action.', 'info');
  }, [canUndo, dispatchHistory, showStatus]);

  const redo = useCallback(() => {
    if (!canRedo) {
      return;
    }

    dispatchHistory({type: 'REDO'});
    showStatus('Redid action.', 'info');
  }, [canRedo, dispatchHistory, showStatus]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        confirmExit('ctrl+c');
        return;
      }

      if (input === 'q') {
        exit();
        return;
      }

      if (key.escape) {
        if (uiMode === MODES.ADD || uiMode === MODES.EDIT || uiMode === MODES.SETTINGS || uiMode === MODES.HELP) {
          setUiMode(MODES.VIEW);
          setDraft('');
          setEditId(null);
          setStatus(DEFAULT_STATUS);
        }
        return;
      }

      if (uiMode === MODES.HELP) {
        if (input === HELP_SHORTCUT) {
          setUiMode(MODES.VIEW);
          setStatus(DEFAULT_STATUS);
        }
        return;
      }

      if (uiMode === MODES.ADD) {
        if (key.ctrl && input === 'z') {
          undo();
        } else if (key.ctrl && (input === 'y' || (key.shift && input === 'z'))) {
          redo();
        }
        return;
      }

      if (uiMode === MODES.EDIT) {
        if (key.ctrl && input === 'z') {
          undo();
        } else if (key.ctrl && (input === 'y' || (key.shift && input === 'z'))) {
          redo();
        }
        return;
      }

      if (uiMode === MODES.SETTINGS) {
        return;
      }

      // VIEW MODE
      if (key.ctrl && input === 'z') {
        undo();
        return;
      }

      if (key.ctrl && (input === 'y' || (key.shift && input === 'z'))) {
        redo();
        return;
      }

      if (key.upArrow || input === 'k') {
        moveSelection(-1);
        return;
      }

      if (key.downArrow || input === 'j') {
        moveSelection(1);
        return;
      }

      if (key.pageDown) {
        moveSelection(5);
        return;
      }

      if (key.pageUp) {
        moveSelection(-5);
        return;
      }

      if (key.home) {
        selectByIndex(0);
        return;
      }

      if (key.end) {
        selectByIndex(tasks.length - 1);
        return;
      }

      if (input === 'a') {
        startAddMode();
        return;
      }

      if (input === 'e') {
        startEditMode();
        return;
      }

      if (input === 'd' || key.delete) {
        handleDelete();
        return;
      }

      if (input === 's') {
        openSettings();
        return;
      }

      if (input === HELP_SHORTCUT) {
        openHelp();
        return;
      }

      if (input === ' ' || key.return) {
        handleToggle();
        return;
      }

      if (input === 'u') {
        undo();
        return;
      }

      if (input === 'r') {
        redo();
        return;
      }

    },
    {enableEscapes: true}
  );

  const [settingsSelection, setSettingsSelection] = useState(0);
  const storageOptions = useMemo(() => Object.values(STORAGE_MODES), []);

  useEffect(() => {
    const currentIndex = storageOptions.indexOf(storageMode);
    setSettingsSelection(currentIndex === -1 ? 0 : currentIndex);
  }, [storageMode, storageOptions]);

  const adjustSettingsSelection = useCallback(
    delta => {
      const nextIndex = (settingsSelection + delta + storageOptions.length) % storageOptions.length;
      setSettingsSelection(nextIndex);
    },
    [settingsSelection, storageOptions]
  );

  useInput(
    (input, key) => {
      if (uiMode !== MODES.SETTINGS) {
        return;
      }

      if (key.upArrow || input === 'k') {
        adjustSettingsSelection(-1);
        return;
      }

      if (key.downArrow || input === 'j') {
        adjustSettingsSelection(1);
        return;
      }

      if (key.return) {
        const selectedMode = storageOptions[settingsSelection];
        applyStorageMode(selectedMode);
        setUiMode(MODES.VIEW);
        return;
      }
    },
    {isActive: uiMode === MODES.SETTINGS}
  );

  const [listWindow, setListWindow] = useState({start: 0, end: 0, window: []});

  useEffect(() => {
    const listHeight = Math.max(MIN_LIST_HEIGHT, (terminalHeight ?? 24) - 12);
    const windowData = computeVisibleWindow(tasks, activeSelectionIndex, listHeight);
    setListWindow(windowData);
  }, [activeSelectionIndex, terminalHeight, tasks]);

  const completedCount = useMemo(
    () => tasks.filter(task => task.done).length,
    [tasks]
  );

  const pendingCount = tasks.length - completedCount;

  const statsLine = useMemo(() => {
    if (!hasTasks) {
      return 'No todos yet.';
    }

    return `${tasks.length} total · ${completedCount} complete · ${pendingCount} remaining`;
  }, [completedCount, hasTasks, pendingCount, tasks.length]);

  const renderTaskRow = (task, index) => {
    const absoluteIndex = listWindow.start + index;
    const isSelected = task.id === selectedId;
    const indicator = isSelected ? '›' : ' ';
    const checkbox = task.done ? '✔' : '○';
    const color = isSelected ? 'cyanBright' : task.done ? 'gray' : 'white';
    const titleColor = task.done ? 'green' : color;

    return h(
      Box,
      {key: `${task.id}-${absoluteIndex}`},
      h(Text, {color}, indicator),
      h(Text, null, ' '),
      h(
        Text,
        {color: isSelected ? 'cyanBright' : 'gray'},
        String(absoluteIndex + 1).padStart(2, ' ')
      ),
      h(Text, null, ' '),
      h(Text, {color: task.done ? 'green' : 'gray'}, checkbox),
      h(Text, null, ' '),
      h(Text, {color: titleColor, strikethrough: task.done}, task.title)
    );
  };

  const renderListBody = () => {
    if (!hasTasks) {
      return h(
        Box,
        {flexDirection: 'column', paddingX: 1, paddingY: 1},
        h(Text, {color: 'gray'}, 'You have no todos yet.'),
        h(Text, {color: 'gray'}, 'Press `a` to add your first task.')
      );
    }

    const {start, end, window} = listWindow;
    const showAbove = start > 0;
    const showBelow = end < tasks.length;

    const rows = [];

    if (showAbove) {
      rows.push(
        h(Text, {color: 'gray', key: `overflow-top-${start}`}, `… ${start} more above`)
      );
    }

    rows.push(...window.map((task, index) => renderTaskRow(task, index)));

    if (showBelow) {
      rows.push(
        h(
          Text,
          {color: 'gray', key: `overflow-bottom-${tasks.length - end}`},
          `… ${tasks.length - end} more below`
        )
      );
    }

    return h(Box, {flexDirection: 'column'}, ...rows);
  };

  const renderAddPanel = () =>
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'magenta',
        paddingX: 1,
        paddingY: 1,
        marginTop: 1,
        key: 'panel-add'
      },
      h(Text, {color: 'magenta'}, 'Add Todo'),
      h(Text, {color: 'gray'}, 'Enter to save, Esc to return.'),
      h(
        Box,
        {marginTop: 1},
        h(Text, {color: 'magenta'}, '› '),
        h(AdvancedTextInput, {
          value: draft,
          onChange: setDraft,
          onSubmit: handleAddSubmit,
          placeholder: 'Describe your next action'
        })
      )
    );

  const renderEditPanel = () =>
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'yellow',
        paddingX: 1,
        paddingY: 1,
        marginTop: 1,
        key: 'panel-edit'
      },
      h(Text, {color: 'yellow'}, 'Edit Todo'),
      h(Text, {color: 'gray'}, 'Update the text. Enter to save, Esc to cancel.'),
      h(
        Box,
        {marginTop: 1},
        h(Text, {color: 'yellow'}, '› '),
        h(AdvancedTextInput, {
          value: draft,
          onChange: setDraft,
          onSubmit: handleEditSubmit,
          placeholder: 'Update the selected task'
        })
      )
    );

  const renderSettingsPanel = () =>
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'cyan',
        paddingX: 1,
        paddingY: 1,
        marginTop: 1,
        key: 'panel-settings'
      },
      h(Text, {color: 'cyan'}, 'Storage Settings'),
      h(Text, {color: 'gray'}, 'Choose where your todos are saved.'),
      h(
        Box,
        {flexDirection: 'column', marginTop: 1},
        ...storageOptions.map((mode, index) => {
          const isActive = index === settingsSelection;
          const isCurrent = mode === storageMode;
          return h(
            Box,
            {key: mode, flexDirection: 'column', marginBottom: 1},
            h(
              Text,
              {color: isActive ? 'cyanBright' : 'gray'},
              `${isActive ? '› ' : '  '}${mode.toUpperCase()}${isCurrent ? ' (current)' : ''}`
            ),
            h(Text, {color: 'gray'}, `  ${storageDescriptions[mode]}`),
            h(Text, {color: 'gray'}, `  Path: ${storagePathLabel(mode)}`)
          );
        })
      ),
      h(Text, {color: 'gray'}, 'Enter to apply selection. Esc to cancel.')
    );

  const renderHelpPanel = () =>
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'blue',
        paddingX: 1,
        paddingY: 1,
        marginTop: 1,
        key: 'panel-help'
      },
      h(Text, {color: 'blueBright'}, 'Keyboard Shortcuts'),
      h(
        Box,
        {flexDirection: 'column', marginTop: 1},
        h(Text, {color: 'gray'}, 'Navigation: ↑ ↓ / j k · PageUp/PageDown · Home/End'),
        h(Text, {color: 'gray'}, 'Add todo: a · Edit: e · Toggle: space/enter · Delete: d'),
        h(Text, {color: 'gray'}, 'Undo: Ctrl+Z or u · Redo: Ctrl+Y / Shift+Ctrl+Z or r'),
        h(Text, {color: 'gray'}, 'Settings: s · Help: ? · Quit: q or double Ctrl+C'),
        h(Text, {color: 'gray'}, 'While adding/editing: Enter to save · Esc to cancel')
      ),
      h(Text, {color: 'gray'}, 'Press Esc or ? to return.')
    );

  const renderSelectedDetails = () => {
    if (!selectedTask) {
      return null;
    }

    return h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'classic',
        borderColor: 'gray',
        paddingX: 1,
        paddingY: 1,
        marginTop: 1,
        key: 'panel-details'
      },
      h(Text, {color: 'gray'}, 'Details'),
      h(
        Text,
        {color: 'gray'},
        'Created: ',
        h(Text, {color: 'white'}, formatTimestamp(selectedTask.createdAt))
      ),
      h(
        Text,
        {color: 'gray'},
        'Completed: ',
        h(Text, {color: 'white'}, formatTimestamp(selectedTask.completedAt))
      )
    );
  };

  const renderStatusBar = () => {
    const toneColor = toneToColor(status.tone);
    const children = [
      h(Text, {color: toneColor}, status.text),
      h(
        Text,
        {color: 'gray'},
        `Undo [${canUndo ? 'ready' : '—'}] · Redo [${canRedo ? 'ready' : '—'}] · Storage: ${storageMode} · ${statsLine}`
      )
    ];

    if (storageError) {
      children.push(h(Text, {color: 'red'}, `Storage warning: ${storageError.message}`));
    }

    return h(
      Box,
      {
        borderStyle: 'single',
        borderColor: 'gray',
        paddingX: 1,
        paddingY: 0,
        marginTop: 1,
        flexDirection: 'column',
        key: 'panel-status'
      },
      ...children
    );
  };

  const headerSection = h(
    Box,
    {flexDirection: 'column', marginBottom: 1, key: 'header'},
    h(Text, {color: 'cyanBright'}, 'Ink Todo Studio'),
    h(Text, {color: 'gray'}, 'Stay focused with a fast, keyboard-driven workflow.'),
    h(
      Text,
      {color: 'gray'},
      'Storage: ',
      h(Text, {color: 'white'}, storageMode),
      ' · Path: ',
      h(Text, {color: 'white'}, storagePathLabel(storageMode))
    )
  );

  const listSection = h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'cyan',
      paddingX: 1,
      paddingY: 1,
      key: 'list'
    },
    h(Text, {color: 'gray'}, statsLine),
    h(Box, {marginTop: 1, flexDirection: 'column'}, renderListBody())
  );

  const panels = [];

  if (uiMode === MODES.ADD) {
    panels.push(renderAddPanel());
  }

  if (uiMode === MODES.EDIT) {
    panels.push(renderEditPanel());
  }

  if (uiMode === MODES.SETTINGS) {
    panels.push(renderSettingsPanel());
  }

  if (uiMode === MODES.HELP) {
    panels.push(renderHelpPanel());
  }

  if (uiMode === MODES.VIEW) {
    const details = renderSelectedDetails();
    if (details) {
      panels.push(details);
    }
  }

  panels.push(renderStatusBar());

  return h(Box, {flexDirection: 'column', paddingX: 1, paddingY: 1}, headerSection, listSection, ...panels);
};

export default App;
