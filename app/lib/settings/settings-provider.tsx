"use client";

import { useEffect, useMemo, useState, ReactNode } from 'react';
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

    // Derive global loading from task states: true if ANY task is active, false if all finished or none started
    const isAnyTaskActive = useMemo(() => {
        const values = Object.values(taskStates);
        if (values.length === 0) return false;
        return values.some((s) => ["running", "pending", "started"].includes((s?.status || "").toLowerCase()));
    }, [taskStates]);

    useEffect(() => {
        setIsLoadingGlobal(isAnyTaskActive);
    }, [isAnyTaskActive]);

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

