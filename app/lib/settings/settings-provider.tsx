"use client";

import { useState, ReactNode } from 'react';
import SettingsGlobalContext from './settings-context';

const SettingsGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
    const [developerMode, setDeveloperMode] = useState(false);
    const [hoverMode, setHoverMode] = useState(false);
    const [taskState, setTaskState] = useState<TaskState>({
        status: "idle",
        progress: 0,
        current_step: "",
        completed_steps: 0,
        total_steps: 0,
        logs: [],
    });
    const [ontologySearchPopupOpen, setOntologySearchPopupOpen] = useState(false);

    const value = {
        isLoadingGlobal,
        setIsLoadingGlobal,
        developerMode,
        setDeveloperMode,
        hoverMode,
        setHoverMode,
        taskState,
        setTaskState,
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

