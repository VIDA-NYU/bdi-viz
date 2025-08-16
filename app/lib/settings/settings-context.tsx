import {createContext} from 'react';

type SettingsGlobalState = {
    isLoadingGlobal: boolean;
    setIsLoadingGlobal: (isLoading: boolean) => void;
    developerMode: boolean;
    setDeveloperMode: (developerMode: boolean) => void;
    hoverMode: boolean;
    setHoverMode: (hoverMode: boolean) => void;
    taskStates: Record<string, TaskState>;
    setTaskStateFor: (taskType: string, taskState: TaskState) => void;
    ontologySearchPopupOpen: boolean;
    setOntologySearchPopupOpen: (ontologySearchPopupOpen: boolean) => void;
}

const SettingsGlobalContext = createContext<SettingsGlobalState>({
    isLoadingGlobal: false,
    setIsLoadingGlobal: () => { },
    developerMode: false,
    setDeveloperMode: () => { },
    hoverMode: false,
    setHoverMode: () => { },
    taskStates: {},
    setTaskStateFor: () => { },
    ontologySearchPopupOpen: false,
    setOntologySearchPopupOpen: () => { },
});


export default SettingsGlobalContext;
