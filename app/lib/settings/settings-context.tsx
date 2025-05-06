import {createContext} from 'react';

type SettingsGlobalState = {
    isLoadingGlobal: boolean;
    setIsLoadingGlobal: (isLoading: boolean) => void;
    developerMode: boolean;
    setDeveloperMode: (developerMode: boolean) => void;
    hoverMode: boolean;
    setHoverMode: (hoverMode: boolean) => void;
    taskState: TaskState;
    setTaskState: (taskState: TaskState) => void;
}

const SettingsGlobalContext = createContext<SettingsGlobalState>({
    isLoadingGlobal: false,
    setIsLoadingGlobal: () => { },
    developerMode: false,
    setDeveloperMode: () => { },
    hoverMode: false,
    setHoverMode: () => { },
    taskState: {
        status: "idle",
        progress: 0,
        current_step: "",
        completed_steps: 0,
        total_steps: 0,
        logs: [],
    },
    setTaskState: () => { },
});


export default SettingsGlobalContext;
