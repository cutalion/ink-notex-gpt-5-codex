import React, {useCallback, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import TextInput from 'ink-text-input';

const h = React.createElement;

const App = () => {
  const {exit} = useApp();
  const [tasks, setTasks] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState('idle');
  const [draft, setDraft] = useState('');

  const hasTasks = tasks.length > 0;
  const selectedTask = useMemo(() => tasks[selectedIndex], [tasks, selectedIndex]);

  const startAdding = useCallback(() => {
    setMode('adding');
    setDraft('');
  }, []);

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (input === 'q') {
        exit();
        return;
      }

      if (input === 'a') {
        startAdding();
        return;
      }

      if (!hasTasks) {
        return;
      }

      if (key.upArrow || input === 'k') {
        setSelectedIndex(index => (index - 1 + tasks.length) % tasks.length);
        return;
      }

      if (key.downArrow || input === 'j') {
        setSelectedIndex(index => (index + 1) % tasks.length);
        return;
      }

      if (input === ' ' || key.return) {
        setTasks(current =>
          current.map((task, index) =>
            index === selectedIndex ? {...task, done: !task.done} : task
          )
        );
        return;
      }

      if (input === 'd' || key.delete) {
        setTasks(current => {
          const next = current.filter((_, index) => index !== selectedIndex);
          const nextIndex = next.length === 0 ? 0 : Math.min(selectedIndex, next.length - 1);
          setSelectedIndex(nextIndex);
          return next;
        });
      }
    },
    {isActive: mode === 'idle', enableEscapes: true}
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        exit();
        return;
      }

      if (key.escape) {
        setMode('idle');
        setDraft('');
      }
    },
    {isActive: mode === 'adding'}
  );

  const handleSubmit = useCallback(
    value => {
      const title = value.trim();

      if (title.length > 0) {
        const newTask = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          title,
          done: false
        };

        setTasks(current => [...current, newTask]);
        setSelectedIndex(tasks.length);
      }

      setDraft('');
      setMode('idle');
    },
    [tasks.length]
  );

  const header = h(
    Box,
    {marginBottom: 1, flexDirection: 'column'},
    h(Text, {color: 'cyan'}, 'Ink TODO'),
    h(
      Text,
      null,
      'Controls: `a` add · arrows/k-j navigate · space/enter toggle · `d` delete · `q` quit'
    ),
    mode === 'adding'
      ? h(Text, {color: 'gray'}, 'Type your task, Enter to save, Esc to cancel.')
      : h(Text, {color: 'gray'}, 'Press `a` to start adding a task.')
  );

  const list = h(
    Box,
    {flexDirection: 'column'},
    hasTasks
      ? tasks.map((task, index) => {
          const isSelected = index === selectedIndex;
          const checkbox = task.done ? '[x]' : '[ ]';

          return h(
            Box,
            {key: task.id},
            h(Text, {color: isSelected ? 'cyan' : 'gray'}, isSelected ? '›' : ' '),
            h(Text, null, ` ${checkbox} `),
            h(
              Text,
              {color: task.done ? 'green' : undefined, strikethrough: task.done},
              task.title
            )
          );
        })
      : h(Text, {color: 'gray'}, 'No tasks yet.')
  );

  const addPanel =
    mode === 'adding'
      ? h(
          Box,
          {marginTop: 1},
          h(Text, {color: 'magenta'}, 'New task: '),
          h(TextInput, {
            value: draft,
            onChange: setDraft,
            onSubmit: handleSubmit,
            placeholder: 'Describe what needs doing'
          })
        )
      : null;

  const selectedPanel =
    selectedTask && mode === 'idle'
      ? h(
          Box,
          {marginTop: 1},
          h(Text, {color: 'gray'}, 'Selected: '),
          h(Text, {color: selectedTask.done ? 'green' : undefined}, selectedTask.title)
        )
      : null;

  const children = [header, list];

  if (addPanel) {
    children.push(addPanel);
  }

  if (selectedPanel) {
    children.push(selectedPanel);
  }

  return h(Box, {flexDirection: 'column'}, ...children);
};

export default App;
