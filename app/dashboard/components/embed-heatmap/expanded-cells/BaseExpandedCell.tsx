import { BaseExpandedCellProps, ExpandedCellProps, ExpandedCellType } from "./types";
import {HistogramCell} from './HistogramCell';
import { FC, useContext } from "react";
import { ScatterCell } from "./ScatterCell";
import { useTheme, IconButton, Box, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SettingsGlobalContext from "@/app/lib/settings/settings-context";

const expandedCellComponents: Record<ExpandedCellType, FC<ExpandedCellProps>> = {
    histogram: HistogramCell,
    scatter: ScatterCell,
 };

const BaseExpandedCell: FC<BaseExpandedCellProps & {
    type: ExpandedCellType;
   }> = ({type, ...props}) => {

    const theme = useTheme();
    const ChartComponent = expandedCellComponents[type];
    const { setOntologySearchPopupOpen } = useContext(SettingsGlobalContext);
    return (
      <g
        data-testid={`expanded-cell-${props.data.sourceColumn}-${props.data.targetColumn}`}
        transform={`translate(${props.x},${props.y})`} 
        onClick={props.onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setOntologySearchPopupOpen(true);
        }}
        >
        <rect className="expanded-cell-background"
          width={props.width}
          height={props.height}
          stroke={theme.palette.grey[300]}
          strokeWidth={2}
          fill={theme.palette.grey[100]}
          rx={3} // Add this line to give the rect a radius
          ry={3} // Add this line to give the rect a radius
          onMouseMove={(e) => props.onMouseMove(e)}
          onMouseLeave={props.onMouseLeave}
        />
        {Array.isArray(props.comments) && props.comments.length > 0 && (
          <g>
            <foreignObject x={4} y={4} width={24} height={24} style={{ overflow: 'visible' }}>
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Tooltip
                  arrow
                  placement="top"
                  title={
                    <Box sx={{ p: 0.5 }}>
                      {(props.comments || []).slice(-5).map((c, idx) => (
                        <Box key={idx} sx={{ mb: idx < Math.min(4, props.comments!.length - 1) ? 0.5 : 0 }}>
                          <div style={{ fontSize: 12 }}>{c.text}</div>
                          <div style={{ fontSize: 10, color: theme.palette.text.secondary }}>
                            {new Date(c.createdAt).toLocaleString()}
                          </div>
                        </Box>
                      ))}
                    </Box>
                  }
                >
                  <IconButton
                    size="small"
                    aria-label="Open comments"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onCommentOpen?.(props.data);
                    }}
                    sx={{
                      width: '50%',
                      height: '50%',
                      p: 0,
                      m: 0,
                      backgroundColor: theme.palette.warning.main,
                      color: theme.palette.common.white,
                      transformOrigin: 'center center',
                      '&:hover': {
                        backgroundColor: theme.palette.warning.dark,
                        transform: 'scale(1.6)'
                      },
                      border: `1px solid ${theme.palette.common.white}`,
                      boxShadow: theme.shadows[1],
                    }}
                  />
                </Tooltip>
              </div>
            </foreignObject>
          </g>
        )}
        <ChartComponent {...props}/>
        <foreignObject x={Math.max(props.width - 28, 0)} y={4} width={24} height={24}
          style={{ overflow: 'visible' }}
        >
          <div>
            <IconButton
              size="small"
              aria-label="Delete mapping"
              onClick={(e) => {
                e.stopPropagation();
                props.deleteCandidate();
              }}
              sx={{
                width: 22,
                height: 22,
                backgroundColor: theme.palette.common.white,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.shadows[1],
                '&:hover': { backgroundColor: theme.palette.grey[50] }
              }}
            >
              <CloseIcon fontSize="inherit"/>
            </IconButton>
          </div>
        </foreignObject>
      </g>
    );
   };

   export {BaseExpandedCell}