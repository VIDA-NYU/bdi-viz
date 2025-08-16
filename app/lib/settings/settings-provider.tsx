"use client";

import { useState, ReactNode } from 'react';
import SettingsGlobalContext from './settings-context';

const SettingsGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
    const [developerMode, setDeveloperMode] = useState(false);
    const [hoverMode, setHoverMode] = useState(false);
    const [taskStates, setTaskStates] = useState<Record<string, TaskState>>({});
    const [ontologySearchPopupOpen, setOntologySearchPopupOpen] = useState(false);

    const setTaskStateFor = (taskType: string, state: TaskState) => {
        setTaskStates(prev => ({ ...prev, [taskType]: state }));
    };

    const value = {
        isLoadingGlobal,
        setIsLoadingGlobal,
        developerMode,
        setDeveloperMode,
        hoverMode,
        setHoverMode,
        taskStates,
        setTaskStateFor,
        ontologySearchPopupOpen,
        setOntologySearchPopupOpen,
    }

    return (
        <SettingsGlobalContext.Provider value={value}>
            {children}
        </SettingsGlobalContext.Provider>
    );
}

export default SettingsGlobalProvider;

