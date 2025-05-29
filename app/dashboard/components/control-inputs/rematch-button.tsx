import { Button } from "@mui/material";
import RefreshIcon from '@mui/icons-material/Refresh';
import { useContext } from "react";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";
import { runRematchTask, getCachedResults, getTargetOntology, getValueBins, getValueMatches } from "@/app/lib/heatmap/heatmap-helper";
import HighlightGlobalContext from "@/app/lib/highlight/highlight-context";

interface RematchButtonProps {
    callback: (candidates: Candidate[], sourceCluster: SourceCluster[]) => void;
    ontologyCallback: (targetOntology: TargetOntology[]) => void;
    uniqueValuesCallback: (sourceUniqueValuesArray: SourceUniqueValues[], targetUniqueValuesArray: TargetUniqueValues[]) => void;
    valueMatchesCallback: (valueMatches: ValueMatch[]) => void;
}

export default function RematchButton({ callback, ontologyCallback, uniqueValuesCallback, valueMatchesCallback }: RematchButtonProps) {
    const { setIsLoadingGlobal, setTaskState } = useContext(SettingsGlobalContext);
    const { selectedNodes } = useContext(HighlightGlobalContext);

    const handleRematch = () => {
        console.log("Rematch task start with nodes: ", selectedNodes);
        try {
            setIsLoadingGlobal(true);
            runRematchTask({
                nodes: selectedNodes,
                onResult: (result) => {
                    console.log("Matching task completed with result:", result);
                    getCachedResults({ callback });
                    getTargetOntology({ callback: ontologyCallback });
                    getValueBins({ callback: uniqueValuesCallback });
                    getValueMatches({ callback: valueMatchesCallback });
                    setIsLoadingGlobal(false);
                },
                onError: (error) => {
                    console.error("Matching task failed with error:", error);
                    setIsLoadingGlobal(false);
                },
                taskStateCallback: (taskState) => {
                    console.log("Task state:", taskState);
                    setTaskState(taskState);
                }
            });
        } catch (error) {
            console.error("Error running rematch task:", error);
            setIsLoadingGlobal(false);
        }
        
    }

    return (
        <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRematch}
            sx={{ 
                marginRight: 2,
                fontSize: "0.7rem",
                textTransform: "none",
                borderRadius: 1
            }}
        >
            Re-match
        </Button>
    );
}