module powerbi.visuals.samples {
    import SelectionManager = utility.SelectionManager;
    import ClassAndSelector = jsCommon.CssConstants.ClassAndSelector;
    import createClassAndSelector = jsCommon.CssConstants.createClassAndSelector;
    import PixelConverter = jsCommon.PixelConverter;

    export interface ITreeView {
        data(data: any[], dataIdFunction: (d) => {}, dataAppended: boolean): ITreeView;
        rowHeight(rowHeight: number): ITreeView;
        viewport(viewport: IViewport): ITreeView;
        render(): void;
        empty(): void;
    }

    export module TreeViewFactory {
        export function createListView(options): ITreeView {
            return new TreeView(options);
        }
    }

    /**
     * A UI Virtualized List, that uses the D3 Enter, Update & Exit pattern to update rows.
     * It can create lists containing either HTML or SVG elements.
     */
    class TreeView implements ITreeView {
        private getDatumIndex: (d: any) => {};
        private _data: any[];
        private _totalRows: number;

        private options: ListViewOptions;
        private visibleGroupContainer: D3.Selection;
        private scrollContainer: D3.Selection;
        private scrollbarInner: D3.Selection;
        private cancelMeasurePass: () => void;
        private renderTimeoutId: number;

        /**
         * The value indicates the percentage of data already shown
         * in the list view that triggers a loadMoreData call.
         */
        private static loadMoreDataThreshold = 0.8;
        private static defaultRowHeight = 1;

        public constructor(options: ListViewOptions) {
            // make a copy of options so that it is not modified later by caller
            this.options = $.extend(true, {}, options);

            this.scrollbarInner = options.baseContainer
                .append('div')
                .classed('scrollbar-inner', true)
                .on('scroll', () => this.renderImpl(this.options.rowHeight));

            this.scrollContainer = this.scrollbarInner
                .append('div')
                .classed('scrollRegion', true)
                .on('touchstart', () => this.stopTouchPropagation())
                .on('touchmove', () => this.stopTouchPropagation());

            this.visibleGroupContainer = this.scrollContainer
                .append('div')
                .classed('visibleGroup', true);

            var scrollInner = $(this.scrollbarInner.node());
            scrollInner.scrollbar({
                ignoreOverlay: false,
                ignoreMobile: false,
                onDestroy: function () { return scrollInner.off('scroll'); },
            });

            $(options.baseContainer.node()).find('.scroll-element').attr('drag-resize-disabled', 'true');

            TreeView.SetDefaultOptions(options);
        }

        private static SetDefaultOptions(options: ListViewOptions) {
            options.rowHeight = options.rowHeight || TreeView.defaultRowHeight;
        }

        public rowHeight(rowHeight: number): TreeView {
            this.options.rowHeight = Math.ceil(rowHeight);
            return this;
        }

        public data(data: any[], getDatumIndex: (d) => {}, dataReset: boolean = false): ITreeView {
            this._data = data;
            this.getDatumIndex = getDatumIndex;
            this.setTotalRows();
            if (dataReset)
                $(this.scrollbarInner.node()).scrollTop(0);

            this.render();
            return this;
        }

        public viewport(viewport: IViewport): ITreeView {
            this.options.viewport = viewport;
            this.render();
            return this;
        }

        public empty(): void {
            this._data = [];
            this.render();
        }

        public render(): void {
            if (this.renderTimeoutId)
                window.clearTimeout(this.renderTimeoutId);

            this.renderTimeoutId = window.setTimeout(() => {
                this.renderImpl(this.options.rowHeight);
                this.renderTimeoutId = undefined;
            }, 0);
        }

        private renderImpl(rowHeight: number): void {
            var totalHeight = this.options.scrollEnabled ? Math.max(0, (this._totalRows * rowHeight)) : this.options.viewport.height;
            this.scrollContainer
                .style('height', totalHeight + "px")
                .attr('height', totalHeight);

            this.scrollToFrame(true /*loadMoreData*/);
        }

        /*
         *  This method is called in order to prevent a bug found in the Interact.js.
         *  The bug is caused when finishing a scroll outside the scroll area.
         *  In that case the Interact doesn't process a touchcancel event and thinks a touch point still exists.
         *  since the Interact listens on the visualContainer, by stoping the propagation we prevent the bug from taking place.
         */
        private stopTouchPropagation(): void {
            //Stop the propagation only in read mode so the drag won't be affected.
            if (this.options.isReadMode()) {
                if (d3.event.type === "touchstart") {
                    var event: TouchEvent = <any>d3.event;
                    //If there is another touch point outside this visual than the event should be propagated.
                    //This way the pinch to zoom will not be affected.
                    if (event.touches && event.touches.length === 1) {
                        d3.event.stopPropagation();
                    }
                }
                if (d3.event.type === "touchmove") {
                    d3.event.stopPropagation();
                }
            }
        }

        private scrollToFrame(loadMoreData: boolean): void {
            var options = this.options;
            var visibleGroupContainer = this.visibleGroupContainer;
            var totalRows = this._totalRows;
            var rowHeight = options.rowHeight || TreeView.defaultRowHeight;
            var visibleRows = this.getVisibleRows() || 1;
            var scrollTop: number = this.scrollbarInner.node().scrollTop;
            var scrollPosition = (scrollTop === 0) ? 0 : Math.floor(scrollTop / rowHeight);
            var transformAttr = SVGUtil.translateWithPixels(0, scrollPosition * rowHeight);

            visibleGroupContainer.style({
                //order matters for proper overriding
                'transform': d => transformAttr,
                '-webkit-transform': transformAttr
            });

            var position0 = Math.max(0, Math.min(scrollPosition, totalRows - visibleRows + 1)),
                position1 = position0 + visibleRows;

            if (this.options.scrollEnabled) {

                // Subtract the amount of height of the top row that's hidden when it's partially visible.
                var topRowHiddenHeight = scrollTop - (scrollPosition * rowHeight);
                var halfRowHeight = rowHeight * 0.5;

                // If more than half the top row is hidden, we'll need to render an extra item at the bottom
                if (topRowHiddenHeight > halfRowHeight) {
                    position1++;  // Add 1 to handle when rows are partially visible (when scrolling)
                }
            }

            var rowSelection = visibleGroupContainer.selectAll(".row")
                .data(this._data.slice(position0, Math.min(position1, totalRows)), this.getDatumIndex);

            rowSelection
                .enter()
                .append('div')
                .classed('row', true)
                .call(d => options.enter(d));
            rowSelection.order();

            var rowUpdateSelection = visibleGroupContainer.selectAll('.row:not(.transitioning)');

            rowUpdateSelection.call(d => options.update(d));

            rowSelection
                .exit()
                .call(d => options.exit(d))
                .remove();

            if (loadMoreData && visibleRows !== totalRows && position1 >= totalRows * TreeView.loadMoreDataThreshold)
                options.loadMoreData();
        }

        private setTotalRows(): void {
            var data = this._data;
            this._totalRows = data ? data.length : 0;
        }

        private getVisibleRows(): number {
            var minimumVisibleRows = 1;
            var rowHeight = this.options.rowHeight;
            var viewportHeight = this.options.viewport.height;

            if (!rowHeight || rowHeight < 1)
                return minimumVisibleRows;

            if (this.options.scrollEnabled)
                return Math.min(Math.ceil(viewportHeight / rowHeight), this._totalRows) || minimumVisibleRows;

            return Math.min(Math.floor(viewportHeight / rowHeight), this._totalRows) || minimumVisibleRows;
        }

        private getRowHeight(): JQueryPromise<number> {
            var deferred = $.Deferred<number>();
            var listView = this;
            var options = listView.options;
            if (this.cancelMeasurePass)
                this.cancelMeasurePass();

            // if there is no data, resolve and return
            if (!(this._data && this._data.length && options)) {
                listView.rowHeight(TreeView.defaultRowHeight);
                return deferred.resolve(options.rowHeight).promise();
            }

            //render the first item to calculate the row height
            this.scrollToFrame(false /*loadMoreData*/);
            var requestAnimationFrameId = window.requestAnimationFrame(() => {
                //measure row height
                var rows = listView.visibleGroupContainer.select(".row");
                if (!rows.empty()) {
                    var firstRow = rows.node();
                    // If the container (child) has margins amd the row (parent) doesn't, the child's margins will collapse into the parent.
                    // outerHeight doesn't report the correct height for the parent in this case, but it does measure the child properly.
                    // Fix for #7497261 Measures both and take the max to work around this issue.
                    var rowHeight: number = Math.max($(firstRow).outerHeight(true), $(firstRow).children().first().outerHeight(true));
                    listView.rowHeight(rowHeight);
                    deferred.resolve(rowHeight);
                }

                listView.cancelMeasurePass = undefined;
                window.cancelAnimationFrame(requestAnimationFrameId);
            });

            this.cancelMeasurePass = () => {
                window.cancelAnimationFrame(requestAnimationFrameId);
                deferred.reject();
            };

            return deferred.promise();
        }
    }

    export class HierarchySlicerWebBehavior implements IInteractiveBehavior {
        private hostServices: IVisualHostServices;
        private slicers: D3.Selection;
        private slicerItemLabels: D3.Selection;
        private slicerItemInputs: D3.Selection;
        private dataPoints: HierarchySlicerDataPoint[];
        private interactivityService: IInteractivityService;
        private settings: HierarchySlicerSettings;
        private levels: number;
        private hierarchyType: HierarchySlicerEnums.HierarchySlicerType;

        public bindEvents(options: HierarchySlicerBehaviorOptions, selectionHandler: ISelectionHandler): void {
            var slicers = this.slicers = options.slicerItemContainers;
            this.slicerItemLabels = options.slicerItemLabels;
            this.slicerItemInputs = options.slicerItemInputs;
            this.dataPoints = options.dataPoints;
            this.interactivityService = options.interactivityService;
            this.settings = options.slicerSettings;
            this.hostServices = options.hostServices;
            this.levels = options.levels;
            this.hierarchyType = options.hierarchyType;

            var slicerClear = options.slicerClear;
            //var filterPropertyId = hierarchySlicerProperties.filterPropertyIdentifier;

            options.slicerContainer.classed('hasSelection', true);

            slicers.on("mouseover", (d: HierarchySlicerDataPoint) => {
                if (d.selectable) {
                    d.mouseOver = true;
                    d.mouseOut = false;
                    this.renderMouseover();
                }
            });

            slicers.on("mouseout", (d: HierarchySlicerDataPoint) => {
                if (d.selectable) {
                    d.mouseOver = false;
                    d.mouseOut = true;
                    this.renderMouseover();
                }
            });

            slicers.on("click", (d: HierarchySlicerDataPoint, index) => {
                if (!d.selectable) {
                    return;
                }
                var settings: HierarchySlicerSettings = this.settings;
                d3.event.preventDefault();
                if (!settings.general.singleselect) { // multi select value
                    var selected = d.selected;
                    selectionHandler.handleSelection(d, true);
                    if (!selected || !d.isLeaf) {
                        var selectDataPoints = this.getChildDataPoints(this.dataPoints, d.ownId);
                        selectDataPoints = selectDataPoints.concat(selectDataPoints, this.getParentDataPoints(this.dataPoints, d.parentId));
                        for (var i = 0; i < selectDataPoints.length; i++) {
                            if (selected === selectDataPoints[i].selected) {
                                selectionHandler.handleSelection(selectDataPoints[i], true);
                            }
                        }
                    }
                    if (d.isLeaf) {
                        if (this.dataPoints.filter((d) => d.selected && d.isLeaf).length === 0) { // Last leaf disabled
                            selectionHandler.handleClearSelection();
                        } 
                    }
                }
                else { // single select value
                    var selected = d.selected;
                    if (selected) {
                        selectionHandler.handleClearSelection();
                    } else {
                        selectionHandler.handleClearSelection();
                        selectionHandler.handleSelection(d, true);
                    }

                    var selectDataPoints = this.getChildDataPoints(this.dataPoints, d.ownId);
                    selectDataPoints = selectDataPoints.concat(selectDataPoints, this.getParentDataPoints(this.dataPoints, d.parentId));
                    for (var i = 0; i < selectDataPoints.length; i++) {
                        if (selected === selectDataPoints[i].selected) {
                            selectionHandler.handleSelection(selectDataPoints[i], true);
                        }
                    } 
                }

                var filter: powerbi.data.SemanticFilter;
                var rootLevels = this.dataPoints.filter((d) => d.level === 0 && d.selected);
                 
                if (rootLevels.length > 0) {
                    var children = this.getChildFilters(this.dataPoints, rootLevels[0].ownId, 1);
                    var rootFilters = [];
                    if (children) {
                        rootFilters.push(powerbi.data.SQExprBuilder.and(rootLevels[0].id, children));
                    } else {
                        rootFilters.push(rootLevels[0].id);
                    }

                    if (rootLevels.length > 1) {
                        for (var i = 1; i < rootLevels.length; i++) {
                            children = this.getChildFilters(this.dataPoints, rootLevels[i].ownId, 1);
                            if (children) {
                                rootFilters.push(powerbi.data.SQExprBuilder.and(rootLevels[i].id, children));
                            } else {
                                rootFilters.push(rootLevels[i].id);
                            }
                        }
                    }

                    var warnings: IVisualWarning[] = [];

                    var rootFilter: powerbi.data.SQExpr = rootFilters[0]; 
                    if ((rootFilters.length === 1) || (this.hierarchyType === HierarchySlicerEnums.HierarchySlicerType.Natural)) {
                        this.hostServices.setWarnings(warnings);
                        
                        for (var i = 1; i < rootFilters.length; i++) {
                            rootFilter = powerbi.data.SQExprBuilder.or(rootFilter, rootFilters[i]);
                        }
                    } else {
                        rootFilter = rootFilters[0];

                        warnings.push({
                            code: 'MultiSelectUnNatural',
                            getMessages: () => {
                                var visualMessage: IVisualErrorMessage = {
                                    message: "Multiselect with an unnatural hierarchy detected.",
                                    title: '',
                                    detail: 'Multi select with an unnatrural hierarchy is not supported. Only selecting the first root node.',
                                };
                                return visualMessage;
                            }
                        });

                        this.hostServices.setWarnings(warnings);
                    }

                    filter = powerbi.data.SemanticFilter.fromSQExpr(rootFilter);
                    this.persist(filter);
                }
                else {
                    selectionHandler.handleClearSelection();
                    this.persist(null);
                }

            });

            slicerClear.on("click", (d: HierarchySlicerDataPoint) => {
                selectionHandler.handleClearSelection();
                this.persist(null);
            });
        }

        private renderMouseover(): void {
            this.slicerItemLabels.style({
                'color': (d: HierarchySlicerDataPoint) => {
                    if (d.mouseOver)
                        return this.settings.slicerText.hoverColor;

                    if (d.mouseOut) {
                        if (d.selected)
                            return this.settings.slicerText.fontColor;
                        else
                            return this.settings.slicerText.fontColor;
                    }
                }
            });
        }

        public renderSelection(hasSelection: boolean): void {
            if (!hasSelection && !this.interactivityService.isSelectionModeInverted()) {
                this.slicerItemInputs.filter('.selected').classed('selected', false);
                this.slicerItemInputs.filter('.partiallySelected').classed('partiallySelected', false);
                var input = this.slicerItemInputs.selectAll('input');
                if (input) {
                    input.property('checked', false);
                }
            }
            else {
                this.styleSlicerInputs(this.slicers, hasSelection);
            }
        }

        public styleSlicerInputs(slicers: D3.Selection, hasSelection: boolean) {
            //var settings = this.settings;
            //var dataPoints = this.dataPoints;
            slicers.each(function (d: HierarchySlicerDataPoint) {
                var slicerItem: HTMLElement = this.getElementsByTagName('div')[0];
                var shouldCheck: boolean = d.selected;
                var partialCheck: boolean = false;
                var input = slicerItem.getElementsByTagName('input')[0];
                if (input)
                    input.checked = shouldCheck;

                if (shouldCheck && partialCheck)
                    slicerItem.classList.add('partiallySelected');
                else if (shouldCheck && (!partialCheck))
                    slicerItem.classList.add('selected');
                else
                    slicerItem.classList.remove('selected');
            });
        }

        private getChildDataPoints(dataPoints: HierarchySlicerDataPoint[], ownId: string): HierarchySlicerDataPoint[] {
            var children = dataPoints.filter((d) => d.parentId === ownId);
            if (children.length === 0) {
                return [];
            } else if (children[0].isLeaf) {
                return children;
            } else {
                var returnChildren = children;
                for (var i = 0; i < children.length; i++) {
                    returnChildren = returnChildren.concat(returnChildren, this.getChildDataPoints(dataPoints, children[i].ownId));
                }
                return returnChildren;
            }
        }

        private getParentDataPoints(dataPoints: HierarchySlicerDataPoint[], parentId: string): HierarchySlicerDataPoint[] {
            var parent = dataPoints.filter((d) => d.ownId === parentId);
            if (parent.length === 0) {
                return [];
            } else if (parent[0].level === 0) {
                return parent;
            } else {
                var returnParents = [];

                returnParents = returnParents.concat(parent, this.getParentDataPoints(dataPoints, parent[0].parentId));

                return returnParents;
            }
        }

        private getChildFilters(dataPoints: HierarchySlicerDataPoint[], parentId: string, level: number): data.SQExpr {
            var childFilters = dataPoints.filter((d) => d.level === level && d.parentId === parentId && d.selected);
            if (childFilters.length === 0) {
                return;
            }
            else if (childFilters[0].isLeaf) { // Leaf level
                var returnFilter = childFilters[0].id;
                if (childFilters.length > 1) {
                    for (var i = 1; i < childFilters.length; i++) {
                        returnFilter = data.SQExprBuilder.or(returnFilter, childFilters[i].id);
                    }
                }
                return returnFilter;
            } else {
                var returnFilter = data.SQExprBuilder.and(childFilters[0].id, 
                    this.getChildFilters(dataPoints, childFilters[0].ownId, level + 1));
                if (childFilters.length > 1) {
                    for (var i = 1; i < childFilters.length; i++) {
                        returnFilter = data.SQExprBuilder.or(returnFilter, 
                            data.SQExprBuilder.and(childFilters[i].id,
                            this.getChildFilters(dataPoints, childFilters[i].ownId, level + 1)));
                    }
                }
                return returnFilter;
            }
        }

        private persist(filter: powerbi.data.SemanticFilter) {
            var properties: { [propertyName: string]: DataViewPropertyValue } = {};
            if (filter) {
                properties[hierarchySlicerProperties.filterPropertyIdentifier.propertyName] = filter;
            } else {
                properties[hierarchySlicerProperties.filterPropertyIdentifier.propertyName] = "";
            }
            properties[hierarchySlicerProperties.filterValuePropertyIdentifier.propertyName] = this.dataPoints.filter((d) => d.selected).map((d) => d.ownId).join(',');

            var objects: VisualObjectInstancesToPersist = {
                merge: [
                    <VisualObjectInstance>{
                        objectName: hierarchySlicerProperties.filterPropertyIdentifier.objectName,
                        selector: undefined,
                        properties: properties,
                    }]
            };

            this.hostServices.persistProperties(objects);
            this.hostServices.onSelect({ data: [] });

        }
    }

    export var hierarchySlicerProperties = {
        selection: {
            singleselect: <DataViewObjectPropertyIdentifier>{ objectName: 'selection', propertyName: 'singleSelect' },
        },
        header: {
            show: <DataViewObjectPropertyIdentifier>{ objectName: 'header', propertyName: 'show' },
            title: <DataViewObjectPropertyIdentifier>{ objectName: 'header', propertyName: 'title' },
        },
        selectedPropertyIdentifier: <DataViewObjectPropertyIdentifier>{ objectName: 'general', propertyName: 'selected' },
        filterPropertyIdentifier: <DataViewObjectPropertyIdentifier>{ objectName: 'general', propertyName: 'filter' },
        filterValuePropertyIdentifier: <DataViewObjectPropertyIdentifier>{ objectName: 'general', propertyName: 'filterValues' },
        defaultValue: <DataViewObjectPropertyIdentifier>{ objectName: 'general', propertyName: 'defaultValue' },
    };

    export interface HierarchySlicerSettings {
        general: {
            rows: number;
            singleselect: boolean;
            showDisabled: string;
            outlineColor: string;
            outlineWeight: number;
        };
        margin: IMargin;
        header: {
            borderBottomWidth: number;
            show: boolean;
            outline: string;
            fontColor: string;
            background: string;
            textSize: number;
            outlineColor: string;
            outlineWeight: number;
            title: string;
        };
        headerText: {
            marginLeft: number;
            marginTop: number;
        };
        slicerText: {
            textSize: number;
            height: number;
            width: number;
            fontColor: string;
            hoverColor: string;
            selectedColor: string;
            unselectedColor: string;
            disabledColor: string;
            marginLeft: number;
            outline: string;
            background: string;
            transparency: number;
            outlineColor: string;
            outlineWeight: number;
            borderStyle: string;
        };
        slicerItemContainer: {
            marginTop: number;
            marginLeft: number;
        };
    }

    export interface HierarchySlicerDataPoint extends SelectableDataPoint {
        value: string;
        tooltip: string;
        level: number;
        mouseOver?: boolean;
        mouseOut?: boolean;
        isSelectAllDataPoint?: boolean;
        selectable?: boolean;
        id: data.SQExpr;
        isLeaf: boolean;
        isExpand: boolean;
        isHidden: boolean;
        ownId: string;
        parentId: string;
    }

    export interface HierarchySlicerData {
        dataPoints: HierarchySlicerDataPoint[];
        hasSelectionOverride?: boolean;
        settings: HierarchySlicerSettings;
        levels: number;
        hierarchyType: HierarchySlicerEnums.HierarchySlicerType;
    }

    export interface HierarchySlicerBehaviorOptions {
        hostServices: IVisualHostServices;
        slicerContainer: D3.Selection;
        slicerItemContainers: D3.Selection;
        slicerItemLabels: D3.Selection;
        slicerItemInputs: D3.Selection;
        slicerClear: D3.Selection;
        dataPoints: HierarchySlicerDataPoint[];
        interactivityService: IInteractivityService;
        slicerSettings: HierarchySlicerSettings;
        levels: number;
        hierarchyType: HierarchySlicerEnums.HierarchySlicerType;
    }

    export module HierarchySlicerEnums {
        export enum HierarchySlicerType {
            Natural,
            UnNatural
        }
    }

    export class HierarchySlicer implements IVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [{
                name: 'Fields',
                kind: powerbi.VisualDataRoleKind.Grouping,
                displayName: 'Fields'
            }],
            dataViewMappings: [{
                table: {
                    rows: {
                        for: { in: 'Fields' },
                        dataReductionAlgorithm: { top: {} }
                    },
                    rowCount: { preferred: { min: 1 } }
                }
            }],
            objects: {
                general: {
                    displayName: 'General',
                    properties: {
                        filter: {
                            type: { filter: {} }
                        },
                        filterValues: {
                            type: { text: true }
                        },
                        defaultValue: {
                            type: { expression: { defaultValue: true } },
                        },
                        formatString: {
                            type: {
                                formatting: { formatString: true }
                            },
                        },
                    },
                },
                selection: {
                    displayName: 'Selection',
                    properties: {
                        singleSelect: {
                            displayName: 'Single Select',
                            type: { bool: true }
                        }
                    },
                },
                header: {
                    displayName: 'Header',
                    properties: {
                        title: {
                            displayName: 'Title',
                            type: { text: true }
                        }
                    },
                }
            },
            supportsHighlight: true,
            suppressDefaultTitle: true,
            sorting: {
                default: {},
            },
            drilldown: {
                roles: ['Category']
            },
            disableSeeData: true,
            
        };

        public static formatStringProp: DataViewObjectPropertyIdentifier = {
            objectName: "general",
            propertyName: "formatString",
        };

        private element: JQuery;
        private behavior: HierarchySlicerWebBehavior;
        //private mainGroupElement: D3.Selection;
        private selectionManager: SelectionManager;
        private viewport: IViewport;
        private hostServices: IVisualHostServices;
        private interactivityService: IInteractivityService;
        private settings: HierarchySlicerSettings;
        private dataView: DataView;
        private data: HierarchySlicerData;
        private treeView: ITreeView;
        private margin: IMargin;
        //private labelFormat: string;
        private waitingForData: boolean;
        private slicerContainer: D3.Selection;
        private slicerHeader: D3.Selection;
        private slicerBody: D3.Selection;

        public static DefaultFontFamily: string = 'Segoe UI, Tahoma, Verdana, Geneva, sans-serif';
        public static DefaultFontSizeInPt: number = 11;

        private static Container: ClassAndSelector = createClassAndSelector('slicerContainer');
        private static Body: ClassAndSelector = createClassAndSelector('slicerBody');
        private static ItemContainer: ClassAndSelector = createClassAndSelector('slicerItemContainer');
        private static LabelText: ClassAndSelector = createClassAndSelector('slicerText');
        //private static LabelImage: ClassAndSelector = createClassAndSelector('slicerImage');
        private static CountText: ClassAndSelector = createClassAndSelector('slicerCountText');
        private static Checkbox: ClassAndSelector = createClassAndSelector('checkbox');
        private static Header: ClassAndSelector = createClassAndSelector('slicerHeader');
        private static HeaderText: ClassAndSelector = createClassAndSelector('headerText');
        private static Clear: ClassAndSelector = createClassAndSelector('clear');
        private static Input: ClassAndSelector = createClassAndSelector('slicerCheckbox');

        public static DefaultSlicerSettings(): HierarchySlicerSettings {
            return {
                general: {
                    rows: 0,
                    singleselect: true,
                    showDisabled: "",
                    outlineColor: '#808080',
                    outlineWeight: 1,
                },
                margin: {
                    top: 50,
                    bottom: 50,
                    right: 50,
                    left: 50
                },
                header: {
                    borderBottomWidth: 1,
                    show: true,
                    outline: 'BottomOnly',
                    fontColor: '#a6a6a6',
                    background: '#ffffff',
                    textSize: 10,
                    outlineColor: '#a6a6a6',
                    outlineWeight: 1,
                    title: '',
                },
                headerText: {
                    marginLeft: 8,
                    marginTop: 0
                },
                slicerText: {
                    textSize: 10,
                    height: 18,
                    width: 0,
                    fontColor: '#666666',
                    hoverColor: '#212121',
                    selectedColor: '#BDD7EE',
                    unselectedColor: '#ffffff',
                    disabledColor: 'grey',
                    marginLeft: 8,
                    outline: 'Frame',
                    background: '#ffffff',
                    transparency: 0,
                    outlineColor: '#000000',
                    outlineWeight: 1,
                    borderStyle: 'Cut',
                },
                slicerItemContainer: {
                    // The margin is assigned in the less file. This is needed for the height calculations.
                    marginTop: 5,
                    marginLeft: 0,
                },
            };
        }

        public converter(dataView: DataView): HierarchySlicerData {
            if (!dataView ||
                !dataView.categorical ||
                !dataView.categorical.categories ||
                !dataView.categorical.categories[0] ||
                !dataView.categorical.categories[0].values ||
                !(dataView.categorical.categories[0].values.length > 0)) {
                return {
                    dataPoints: [],
                    settings: null,
                    levels: null,
                    hierarchyType: HierarchySlicerEnums.HierarchySlicerType.UnNatural,
                };
            }

            var rows = dataView.table.rows;
            var columns = dataView.table.columns;
            var identities = dataView.categorical.categories;
            var levels = rows[0].length - 1;
            var dataPoints = [];
            var defaultSettings: HierarchySlicerSettings = HierarchySlicer.DefaultSlicerSettings();
            var identityValues = [];
            var selectedIds = [];
            var selectionFilter;
            var hierarchyType = HierarchySlicerEnums.HierarchySlicerType.UnNatural;

            var leafs = dataView.categorical.categories[dataView.categorical.categories.length - 1].values;
            if (leafs.length === leafs.filter((v, i, s) => s.indexOf(v) === i).length) {
                hierarchyType = HierarchySlicerEnums.HierarchySlicerType.Natural;
            }

            var objects = dataView.metadata.objects;
            
            defaultSettings.general.singleselect = DataViewObjects.getValue<boolean>(objects, hierarchySlicerProperties.selection.singleselect, defaultSettings.general.singleselect);
            defaultSettings.header.title = DataViewObjects.getValue<string>(objects, hierarchySlicerProperties.header.title, dataView.categorical.categories[0].source.displayName);
            selectionFilter = DataViewObjects.getValue<string>(objects, hierarchySlicerProperties.filterPropertyIdentifier, "");
            selectedIds = DataViewObjects.getValue<string>(objects, hierarchySlicerProperties.filterValuePropertyIdentifier, "").split(',');

            for (var r = 0; r < rows.length; r++) {
                var parentExpr = null;
                var parentId: string = '';

                for (var c = 0; c < rows[r].length; c++) {
                    var columnCategoryIndex: number = identities.map((v, i) => { return v.source.queryName === columns[c].queryName ? i : null }).filter((v) => { return v !== null; })[0];
                    var format = dataView.categorical.categories[columnCategoryIndex].source.format ? dataView.categorical.categories[columnCategoryIndex].source.format : null;
                    var dataType: ValueTypeDescriptor = dataView.categorical.categories[columnCategoryIndex].source.type ? dataView.categorical.categories[columnCategoryIndex].source.type : "";
                    var labelValue = valueFormatter.format(rows[r][c], format) === null ? "(blank)" : valueFormatter.format(rows[r][c], format);
                    var value: data.SQConstantExpr;

                    if (rows[r][c] === null) {
                        value = powerbi.data.SQExprBuilder.nullConstant();
                    } else {
                        if (dataType.text) {
                            value = powerbi.data.SQExprBuilder.text(rows[r][c]);
                        } else if (dataType.integer || dataType.numeric) {
                            value = powerbi.data.SQExprBuilder.integer(rows[r][c]);
                        } else if (dataType.bool) {
                            value = powerbi.data.SQExprBuilder.boolean(rows[r][c]);
                        } else if (dataType.dateTime) {
                            value = powerbi.data.SQExprBuilder.dateTime(rows[r][c]);
                        } else {
                            value = powerbi.data.SQExprBuilder.text(rows[r][c]);
                        }
                    }
                    var filterExpr = powerbi.data.SQExprBuilder.compare(
                        data.QueryComparisonKind.Equal,
                        <powerbi.data.SQExpr>dataView.categorical.categories[0].identityFields[columnCategoryIndex],
                        value);

                    if (c > 0) {
                        parentExpr = powerbi.data.SQExprBuilder.and(parentExpr, filterExpr);
                    }
                    else {
                        parentId = "";
                        parentExpr = filterExpr;
                    }
                    var ownId = parentId + (parentId === "" ? "" : '_') + labelValue.replace(',', '') + '-' + c;
                    var isLeaf = c === rows[r].length - 1;
                    
                    var selector: data.Selector = {
                        data: [data.createDataViewScopeIdentity(parentExpr)],
                    };
                    if (isLeaf) {
                        selector = { data: [dataView.table.identity[r]] };
                    }
                    var identity = new SelectionId(selector, false);

                    var dataPoint = {
                        identity: identity,
                        selected: selectedIds.filter((d) => d === ownId).length > 0,
                        value: labelValue,
                        tooltip: labelValue,
                        level: c,
                        selectable: true,
                        partialSelected: false,
                        isLeaf: isLeaf,
                        isExpand: false,
                        isHidden: c !== 0,
                        id: filterExpr,
                        ownId: ownId,
                        parentId: parentId
                    };

                    parentId = ownId;

                    if (identityValues.indexOf(ownId) === -1) {
                        identityValues.push(ownId);
                        dataPoints.push(dataPoint);
                    }
                }
            }

            return {
                dataPoints: dataPoints,
                settings: defaultSettings,
                levels: levels,
                hasSelectionOverride: true,
                hierarchyType: hierarchyType,
            };
        }

        public constructor(options?: any) {
            if (options) {
                if (options.margin) {
                    this.margin = options.margin;
                }
                if (options.behavior) {
                    this.behavior = options.behavior;
                }
            }

            if (!this.behavior) {
                this.behavior = new HierarchySlicerWebBehavior();
            }
        }

        public init(options: VisualInitOptions): void {
            var hostServices = this.hostServices = options.host;
            //this.addScript("jqueryscrollbar", "https://gromo.github.io/jquery.scrollbar/jquery.scrollbar.min.js");
            this.element = options.element;
            this.viewport = options.viewport;
            this.hostServices = options.host;
            this.settings = HierarchySlicer.DefaultSlicerSettings();
            
            this.selectionManager = new SelectionManager({ hostServices: options.host });
            this.selectionManager.clear();
                        
            if (this.behavior)
                this.interactivityService = createInteractivityService(hostServices);

            this.slicerContainer = d3.select(this.element.get(0))
                .append('div')
                .classed(HierarchySlicer.Container.class, true);

            this.slicerHeader = this.slicerContainer
                .append('div')
                .classed(HierarchySlicer.Header.class, true);

            this.slicerHeader
                .append('span')
                .classed(HierarchySlicer.Clear.class, true)
                .attr('title', 'Clear');

            this.slicerHeader
                .append('div')
                .classed(HierarchySlicer.HeaderText.class, true);

            this.slicerBody = this.slicerContainer
                .append('div')
                .classed(HierarchySlicer.Body.class, true)
                .style({
                    'height': PixelConverter.toString(this.viewport.height),
                    'width': PixelConverter.toString(this.viewport.width),
                });

            //var containerDiv = document.createElement('div');
            //containerDiv.className = HierarchySlicer.Container.class;
            //var container = this.slicerContainer = d3.select(containerDiv);

            //this.slicerHeader = this.slicerContainer
            //    .append('div')
            //    .classed(HierarchySlicer.Header.class, true);

            //this.slicerHeader
            //    .append('span')
            //    .classed(HierarchySlicer.Clear.class, true)
            //    .attr('title', 'Clear');

            //this.slicerHeader
            //    .append('div')
            //    .classed(HierarchySlicer.HeaderText.class, true);

            //this.slicerBody = container.append('div').classed(HierarchySlicer.Body.class, true)
            //    .style({
            //        'height': PixelConverter.toString(this.viewport.height),
            //        'width': PixelConverter.toString(this.viewport.width),
            //    });

            var rowEnter = (rowSelection: D3.Selection) => {
                this.onEnterSelection(rowSelection);
            };

            var rowUpdate = (rowSelection: D3.Selection) => {
                this.onUpdateSelection(rowSelection, this.interactivityService);
            };

            var rowExit = (rowSelection: D3.Selection) => {
                rowSelection.remove();
            };

            var treeViewOptions: ListViewOptions = {
                rowHeight: this.getRowHeight(),
                enter: rowEnter,
                exit: rowExit,
                update: rowUpdate,
                loadMoreData: () => this.onLoadMoreData(),
                scrollEnabled: true,
                viewport: this.getBodyViewport(this.viewport),
                baseContainer: this.slicerBody,
                isReadMode: () => {
                    return (this.hostServices.getViewMode() !== ViewMode.Edit);
                }
            };

            this.treeView = TreeViewFactory.createListView(treeViewOptions);
        }

        public update(options: VisualUpdateOptions): void {
            this.viewport = options.viewport;
            this.dataView = options.dataViews[0];

            if (options.viewport.height === this.viewport.height
                && options.viewport.width === this.viewport.width) {
                this.waitingForData = false;
            }

            this.updateInternal(false);
        }

        public onDataChanged(options: VisualDataChangedOptions): void {
            var dataViews = options.dataViews;
            
            if (_.isEmpty(dataViews)) {
                return;
            }

            var existingDataView = this.dataView;
            this.dataView = dataViews[0];

            var resetScrollbarPosition = options.operationKind !== VisualDataChangeOperationKind.Append
                && !DataViewAnalysis.hasSameCategoryIdentity(existingDataView, this.dataView);

            this.updateInternal(resetScrollbarPosition);
        }

        public onResizing(viewPort: IViewport) {
            this.viewport = viewPort;
            this.updateInternal(false);
        }

        private updateInternal(resetScrollbar: boolean) {
            this.updateSlicerBodyDimensions();

            var dataView = this.dataView,
                data = this.data = this.converter(dataView);
            
            if (data.dataPoints.length === 0) {
                this.treeView.empty();
                return;
            }

            this.settings = this.data.settings;
            this.updateSelectionStyle();

            this.treeView
                .viewport(this.getBodyViewport(this.viewport))
                .rowHeight(this.settings.slicerText.height)
                .data(
                //data.dataPoints.filter((d) => !d.isHidden), // Expand/Collapse
                data.dataPoints,
                (d: HierarchySlicerDataPoint) => $.inArray(d, data.dataPoints),
                resetScrollbar
                )
                .render();
        }

        private updateSelectionStyle(): void {
            var objects = this.dataView && this.dataView.metadata && this.dataView.metadata.objects;
            if (objects) {
                this.slicerContainer.classed('isMultiSelectEnabled', !DataViewObjects.getValue<boolean>(objects, hierarchySlicerProperties.selection.singleselect, this.settings.general.singleselect));
            }
        }

        private updateSlicerBodyDimensions(): void {
            var slicerViewport: IViewport = this.getBodyViewport(this.viewport);
            this.slicerBody
                .style({
                    'height': PixelConverter.toString(slicerViewport.height),
                    'width': '100%',
                });
        }

        private onEnterSelection(rowSelection: D3.Selection): void {
            var settings = this.settings;
            var treeItemElement = rowSelection.append('li')
                .classed(HierarchySlicer.ItemContainer.class, true);

            // Expand/collapse
            //treeItemElement.each(function (d: HierarchySlicerDataPoint, i: number) {
            //    var item = d3.select(this);
            //    if (!d.isLeaf) {
            //        item.append('i')
            //            .classed("caret", true)
            //            .classed("glyphicon", true)
            //            .classed("pbi-glyph-caretright", true)
            //            .classed("glyph-mini", true);
            //    }
            //});

            var labelElement = treeItemElement.append('div')
                .classed(HierarchySlicer.Input.class, true);

            labelElement.append('input')
                .attr('type', 'checkbox');

            labelElement.append('span')
                .classed(HierarchySlicer.Checkbox.class, true);

            treeItemElement.each(function (d: HierarchySlicerDataPoint, i: number) {
                var item = d3.select(this);
                item.append('span')
                    .classed(HierarchySlicer.LabelText.class, true);
                item.style('padding-left', d.level * 15 + 'px');
            });

            treeItemElement.append('span')
                .classed(HierarchySlicer.CountText.class, true)
                .style('font-size', PixelConverter.fromPoint(settings.slicerText.textSize));
        }

        private onUpdateSelection(rowSelection: D3.Selection, interactivityService: IInteractivityService): void {
            var settings: HierarchySlicerSettings = this.settings;
            var data = this.data;
            if (data) {
                if (settings.header.show) {
                    this.slicerHeader.style('display', 'block');
                } else {
                    this.slicerHeader.style('display', 'none');
                }
                this.slicerHeader.select(HierarchySlicer.HeaderText.selector)
                    .text(settings.header.title.trim())
                    .style({
                        'color': settings.slicerText.fontColor,
                        'border-style': 'solid',
                        'border-color': settings.general.outlineColor,
                        'border-width': this.getBorderWidth(settings.header.outline, settings.header.outlineWeight),
                        'font-size': PixelConverter.fromPoint(settings.header.textSize),
                    });

                this.slicerBody
                    .classed('slicerBody', true);

                var slicerText = rowSelection.selectAll(HierarchySlicer.LabelText.selector);

                slicerText.text((d: HierarchySlicerDataPoint) => {
                    return d.value;
                });

                if (interactivityService && this.slicerBody) {
                    var body = this.slicerBody.attr('width', this.viewport.width);
                    var slicerItemContainers = body.selectAll(HierarchySlicer.ItemContainer.selector);
                    var slicerItemLabels = body.selectAll(HierarchySlicer.LabelText.selector);
                    var slicerItemInputs = body.selectAll(HierarchySlicer.Input.selector);
                    var slicerClear = this.slicerHeader.select(HierarchySlicer.Clear.selector);

                    var behaviorOptions: HierarchySlicerBehaviorOptions = {
                        hostServices: this.hostServices,
                        dataPoints: data.dataPoints,
                        slicerContainer: this.slicerContainer,
                        slicerItemContainers: slicerItemContainers,
                        slicerItemLabels: slicerItemLabels,
                        slicerItemInputs: slicerItemInputs,
                        slicerClear: slicerClear,
                        interactivityService: interactivityService,
                        slicerSettings: data.settings,
                        levels: data.levels,
                        hierarchyType: data.hierarchyType,
                    };

                    interactivityService.bind(
                        data.dataPoints,
                        this.behavior,
                        behaviorOptions,
                        {
                            overrideSelectionFromData: true,
                            hasSelectionOverride: data.hasSelectionOverride
                        });

                    this.behavior.styleSlicerInputs(
                        rowSelection.select(HierarchySlicer.ItemContainer.selector),
                        interactivityService.hasSelection());
                }
                else {
                    this.behavior.styleSlicerInputs(
                        rowSelection.select(HierarchySlicer.ItemContainer.selector),
                        false);
                }

            }
        }

        private onLoadMoreData(): void {
            if (!this.waitingForData && this.dataView.metadata && this.dataView.metadata.segment) {
                this.hostServices.loadMoreData();
                this.waitingForData = true;
            }
        }

        public static getTextProperties(textSize?: number): TextProperties {
            return <TextProperties>{
                fontFamily: HierarchySlicer.DefaultFontFamily,
                fontSize: PixelConverter.fromPoint(textSize || HierarchySlicer.DefaultFontSizeInPt),
            };
        }

        private getHeaderHeight(): number {
            return TextMeasurementService.estimateSvgTextHeight(
                HierarchySlicer.getTextProperties(this.settings.header.textSize));
        }

        private getRowHeight(): number {
            return TextMeasurementService.estimateSvgTextHeight(
                HierarchySlicer.getTextProperties(this.settings.slicerText.textSize));
        }

        private getBodyViewport(currentViewport: IViewport): IViewport {
            var settings = this.settings;
            var headerHeight;
            var slicerBodyHeight;
            if (settings) {
                headerHeight = settings.header.show ? this.getHeaderHeight() : 0;
                slicerBodyHeight = currentViewport.height - (headerHeight + settings.header.borderBottomWidth);
            } else {
                headerHeight = 0;
                slicerBodyHeight = currentViewport.height - (headerHeight + 1);
            }
            return {
                height: slicerBodyHeight,
                width: currentViewport.width
            };
        }

        private getBorderWidth(outlineElement: string, outlineWeight: number): string {
            switch (outlineElement) {
                case 'None':
                    return '0px';
                case 'BottomOnly':
                    return '0px 0px ' + outlineWeight + 'px 0px';
                case 'TopOnly':
                    return outlineWeight + 'px 0px 0px 0px';
                case 'TopBottom':
                    return outlineWeight + 'px 0px ' + outlineWeight + 'px 0px';
                case 'LeftRight':
                    return '0px ' + outlineWeight + 'px 0px ' + outlineWeight + 'px';
                case 'Frame':
                    return outlineWeight + 'px';
                default:
                    return outlineElement.replace("1", outlineWeight.toString());
            }
        }

        private addScript(alias: string, uri: string) {
            var existentScript = document.getElementById(alias);
            if (existentScript != null) {
                $('script').each(function () {
                    if (this.src.indexOf('uri') >= 0) {
                        // console.log('removed', this.src);
                        $(this).remove();
                    }
                });
            }
            var body = document.getElementsByTagName('body')[0];
            var script = document.createElement('script');
            script.id = alias;
            script.type = 'text/javascript';
            body.appendChild(script);
            script.src = uri;
        }

        private addScriptSnippet(alias: string, snippet: string) {
            var existentScript = document.getElementById(alias);
            if (existentScript != null) {
                $('script').each(function () {
                        $(this).remove();
                });
            }
            var body = document.getElementsByTagName('body')[0];
            var script = document.createElement('script');
            script.id = alias;
            script.type = 'text/javascript';
            body.appendChild(script);
            script.innerText = snippet;
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];
            var objects = this.dataView.metadata.objects;

            switch (options.objectName) {
                case "selection":
                    if (this.data.hierarchyType === HierarchySlicerEnums.HierarchySlicerType.UnNatural) {
                        break;
                    }
                    var selectionOptions: VisualObjectInstance = {
                        objectName: "selection",
                        displayName: "Selection",
                        selector: null,
                        properties: {
                            singleSelect: DataViewObjects.getValue<boolean>(objects, hierarchySlicerProperties.selection.singleselect, this.settings.general.singleselect),
                        }
                    };
                    instances.push(selectionOptions);
                    break;
                case "header":
                    var headerOptions: VisualObjectInstance = {
                        objectName: "header",
                        displayName: "Header",
                        selector: null,
                        properties: {
                            title: DataViewObjects.getValue<string>(objects, hierarchySlicerProperties.header.title, this.settings.header.title),
                        }
                    };
                    instances.push(headerOptions);
                    break;

            }

            return instances;
        }
    }
}