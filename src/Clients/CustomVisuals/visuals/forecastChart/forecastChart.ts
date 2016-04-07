/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.visuals.samples {
    import SelectionManager = utility.SelectionManager;
    import ClassAndSelector = jsCommon.CssConstants.ClassAndSelector;

    export interface ForecastChartConstructorOptions {
        svg?: D3.Selection;
        margin?: IMargin;
    }

    export interface ForecastChartDatapoint {
        x: number;
        y: number;
        pi: number;
        forecast: number;
        label: string;
        color: string;
        dataLabel?: ForecastDataLabel;
        identity: SelectionId;
        tooltipInfo?: TooltipDataItem[];
    }

    export interface ForecastChartSeries {
        color: string;
        name: string;
        identity: SelectionId;
    }

    export interface ForecastChartInfo {
        alpha: number;
        beta: number;
        gamma: number;
        RMSA: number;
    }

    export interface ForecastChartData {
        dataPoints: ForecastChartDatapoint[][];
        forecastInfo: ForecastChartInfo;
        legendData: LegendData;
        series: ForecastChartSeries[];
        axisLabels: string[];
    }

    export interface ForecastDataLabel {
        value: number;
        y: number;
        x: number;
    }

    export interface ForecastAxisOptions {
        max: number;
        min: number;
        ticks: number;
        tickSize: number;
    }

    export interface ForecastInitValues {
        lt: number;
        bt: number;
        st: number[];
    }

    export interface ForecastValues {
        ft: number[];
        MSE: number;
        Coefficent: ForecastCoefficients;
    }

    export interface ForecastCoefficients {
        lt: number;
        bt: number;
        st: number[];
    }

    export class ForecastChart implements IVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [{
                name: 'Category',
                kind: powerbi.VisualDataRoleKind.Grouping,
                displayName: 'Category'
            },
                {
                    name: 'Y',
                    kind: powerbi.VisualDataRoleKind.Measure,
                    displayName: 'Values'
                },
            ],
            dataViewMappings: [{
                conditions: [{
                    'Category': { max: 1 },
                    'Y': { min: 1, max: 1 }
                }
                ],
                categorical: {
                    categories: {
                        for: { in: 'Category' },
                        dataReductionAlgorithm: { top: {} }
                    },
                    values: {
                        select: [{ for: { in: 'Y' } }]
                    }
                }
            }],
            objects: {
                general: {
                    displayName: data.createDisplayNameGetter('Visual_General'),
                    properties: {
                        formatString: {
                            type: {
                                formatting: { formatString: true }
                            },
                        },
                    },
                }, forecast: {
                    displayName: "Forecast",
                    properties: {
                        season: {
                            displayName: "Seasonality",
                            type: { numeric: true }
                        },
                        predict: {
                            displayName: "Prediction",
                            type: { numeric: true }
                        }
                    }
                }, dataPoint: {
                    displayName: "Data colors",
                    properties: {
                        fill: {
                            displayName: "Fill",
                            type: {
                                fill: { solid: { color: true } }
                            }
                        }
                    }
                }, gridLines: {
                    displayName: "Gridlines",
                    properties: {
                        majorGrid: {
                            displayName: "Major grid",
                            description: "Display major gridlines",
                            type: { bool: true }
                        },
                        minorGrid: {
                            displayName: "Minor grid",
                            description: "Display minor gridlines",
                            type: { bool: true }
                        }
                    }
                }, labels: {
                    displayName: "Data labels",
                    properties: {
                        show: {
                            displayName: "Show",
                            type: { bool: true }
                        }
                    }
                }, legend: {
                    displayName: "Legend",
                    properties: {
                        show: {
                            displayName: "Show",
                            description: "Show legend",
                            type: { bool: true }
                        },
                        showTitle: {
                            displayName: "Title",
                            description: "Display a title for legend symbols",
                            type: { bool: true }
                        },
                        titleText: {
                            displayName: "Legend Name",
                            description: "Title text",
                            type: { text: true }
                        }
                    }
                }
            }
        };

        private static properties = {
            formatString: {
                objectName: "general",
                propertyName: "formatString"
            },
            seasonality: {
                objectName: "forecast",
                propertyName: "season"
            },
            prediction: {
                objectName: "forecast",
                propertyName: "predict"
            },
            showMajorGridLines: {
                objectName: "gridLines",
                propertyName: "majorGrid"
            },
            showMinorGridLines: {
                objectName: "gridLines",
                propertyName: "minorGrid"
            },
            fill: {
                objectName: "dataPoint",
                propertyName: "fill"
            },
            dataLabelShow: {
                objectName: "labels",
                propertyName: "show"
            },
            legendShow: {
                objectName: "legend",
                propertyName: "show"
            },
            legendShowTitle: {
                objectName: "legend",
                propertyName: "showTitle"
            },
            legendTitleText: {
                objectName: "legend",
                propertyName: "titleText"
            },
        };

        public static formatStringProp: DataViewObjectPropertyIdentifier = {
            objectName: "general",
            propertyName: "formatString",
        };

        private static VisualClassName = "forecastChart";
        private static Axis: ClassAndSelector = { class: "axis", selector: ".axis" };
        private static AxisX: ClassAndSelector = { class: "axisX", selector: ".axisX" };
        private static AxisGrid: ClassAndSelector = { class: "axisGrid", selector: ".axisGrid" };
        private static AxisY: ClassAndSelector = { class: "axisY", selector: ".axisY" };
        private static AxisNode: ClassAndSelector = { class: "axisNode", selector: ".axisNode" };
        private static AxisLabel: ClassAndSelector = { class: "axisLabel", selector: ".axisLabel" };
        private static Chart: ClassAndSelector = { class: "chart", selector: ".chart" };
        private static ChartNode: ClassAndSelector = { class: 'chartNode', selector: '.chartNode' };
        private static ChartLine: ClassAndSelector = { class: 'chartLine', selector: '.chartLine' };
        private static ChartDot: ClassAndSelector = { class: 'chartDot', selector: '.chartDot' };
        private static ChartPIArea: ClassAndSelector = { class: 'chartPIArea', selector: '.chartPIArea' };
        private static ChartDataLabel: ClassAndSelector = { class: "chartDataLabel", selector: ".chartDataLabel" };

        private svg: D3.Selection;
        private axis: D3.Selection;
        private chart: D3.Selection;
        private axisX: D3.Selection;
        private axisY: D3.Selection;
        private axisGrid: D3.Selection;
        private axisOptions: ForecastAxisOptions;

        private mainGroupElement: D3.Selection;
        private colors: IDataColorPalette;
        private selectionManager: SelectionManager;
        private viewport: IViewport;
        private hostServices: IVisualHostServices;
        private dataView: DataView;
        private data: ForecastChartData;

        private alpha: number;
        private beta: number;
        private gamma: number;
        private RMSE: number;

        private margin: IMargin;
        private legend: ILegend;
        private format: string;
        private labelFormat: string;

        private LegendPadding: number = 5;
        private DefaultLegendSize: number = 20;
        private LegendSize: number = this.DefaultLegendSize;
        private AxisSizeY: number = 40;
        private AxisSizeX: number = 0;
        private ChartPadding: number = 25;
        private static DefaultMargin: IMargin = {
            top: 50,
            bottom: 50,
            right: 100,
            left: 100
        };

        public converter(dataView: DataView, colors: IDataColorPalette): ForecastChartData {
            if (!dataView ||
                !dataView.categorical.values ||
                dataView.categorical.values.length < 1 ||
                !dataView.categorical ||
                !dataView.categorical.categories ||
                !dataView.categorical.categories[0]) {
                return {
                    dataPoints: [],
                    forecastInfo: null,
                    legendData: {
                        dataPoints: []
                    },
                    series: [],
                    axisLabels: [],
                };
            }

            var series: ForecastChartSeries[] = [];
            var dataPoints: ForecastChartDatapoint[][] = [];
            var axisLabels: string[] = [];
            var legendData: LegendData = {
                fontSize: 8.25,
                dataPoints: [],
                title: dataView.metadata.columns[1].displayName,
            };
            var values = dataView.categorical.values[0];

            var colorHelper = new ColorHelper(this.colors, ForecastChart.properties.fill, this.colors.getColorByIndex(0).value);
            var color = "";
            var displayName = "";
            var queryName = "";

            this.format = dataView.categorical.values[0].source.format ? dataView.categorical.values[0].source.format : "#,0.00";
            this.labelFormat = dataView.categorical.categories[0].source.format ? dataView.categorical.categories[0].source.format : "@";

            if (values.source) {
                if (values.source.queryName) queryName = values.source.queryName;
                if (values.source.displayName) displayName = values.source.displayName;
                if (values.source.objects) {
                    var objects: any = values.source.objects;
                    color = colorHelper.getColorForMeasure(objects, queryName);
                }
            };

            series.push({
                color: color,
                name: displayName,
                identity: SelectionId.createWithMeasure(queryName)
            });

            legendData.dataPoints
                .push({
                    label: displayName,
                    color: color,
                    icon: LegendIcon.Box,
                    selected: false,
                    identity: SelectionId.createWithMeasure(queryName),
                });

            var x = values.values;
            var period = this.getSeasonality(this.dataView);
            var h = this.getPrediction(this.dataView);
            var mseSteps = 11;

            var seasons = x.length / period;
            var residuals: number[] = [];

            var ttl: number = 0;
            x.forEach(value => { ttl += value; });
            var avgvalue = ttl / x.length;

            var initvalues = this.initValues(x, period);

            var mse: number[] = [];
            for (var a = 0; a < mseSteps - 1; a++) {                // 0 <  a <  1
                for (var b = 0; b < mseSteps; b++) {                // 0 <= b <= 1
                    for (var g = 0; g < mseSteps - a - 2; g++) {    // 0 <  g <  1 - a
                        var alpha = (a + 1) / (mseSteps - 1.0);
                        var beta = b / (mseSteps - 1.0);
                        var gamma = g / (mseSteps - 1.0);
                        var index = (a * mseSteps * mseSteps) + (b * mseSteps) + g;
                        var forecast = this.calcHoltWinters(x, initvalues, alpha, beta, gamma, period);

                        mse[index] = forecast.MSE;
                    }
                }
            }

            var mseValue = mse.reduce((n1, n2) => { return Math.min(n1, n2) });
            var mseIndex = mse.indexOf(mseValue);

            var a = Math.floor(mseIndex / mseSteps / mseSteps);
            this.alpha = (a + 1) / (mseSteps - 1.0);
            this.beta = Math.floor((mseIndex - (a * mseSteps * mseSteps)) / mseSteps) / (mseSteps - 1.0);
            this.gamma = (mseIndex % mseSteps) / (mseSteps - 1.0);

            if ((this.alpha < 0 && this.alpha > 1) ||
                (this.beta < 0 && this.beta > 1) ||
                (this.gamma < 0 && this.gamma > 1)) {
                return {
                    dataPoints: [],
                    forecastInfo: null,
                    legendData: {
                        dataPoints: []
                    },
                    series: [],
                    axisLabels: [],
                };
            }
            this.RMSE = mseValue;

            var finalFit = this.calcHoltWinters(x, initvalues, this.alpha, this.beta, this.gamma, period);
            var predict = this.predict(finalFit.Coefficent, h);

            var forecastInfo: ForecastChartInfo = {
                alpha: this.alpha,
                beta: this.beta,
                gamma: this.gamma,
                RMSA: this.RMSE,
            } 

            dataPoints.push([]);

            var psi = function (n, a, b, g): number {
                return a * (1 + (n * b)) +
                    (n % period == 0 ? 1 : 0) *
                    g * (1 - a)
            }

            var varResiduals = function (a: number[]): number {
                var m = d3.mean(a);
                var t = d3.sum(a.map((v) => Math.pow(v - m, 2)))

                return (1 / (a.length - 1)) * t;
            }

            var vars = function (n, a, b, g, arr: number[]): number {
                var vars = 1;
                for (var i = 1; i <= n - 1; i++) {
                    vars += Math.pow(psi(i, a, b, g), 2);
                }
                return varResiduals(arr) * vars;
            }

            for (var i = 0; i < x.length + h; i++) {
                var y = i < x.length ? x[i] : predict[i - x.length];
                var isRegular = i < x.length ? true : false;

                if (y == null) {
                    y = 0;
                }

                if (isRegular) {
                    residuals.push(x[i] - finalFit.ft[i]);
                }

                axisLabels.push(isRegular
                    ? valueFormatter.format(dataView.categorical.categories[0].values[i], this.labelFormat, true)
                    : "T(" + (i - x.length + 1) + ")");

                if (!isRegular) {
                    var pi = 1.959964 * Math.sqrt(vars(
                        i + 1,
                        this.alpha,
                        this.beta,
                        this.gamma,
                        residuals));
                }

                var id = SelectionIdBuilder.builder()
                    .withSeries(dataView.categorical.values, dataView.categorical.values[i])
                    .createSelectionId();

                var tooltipInfo: TooltipDataItem[] =
                    [{
                        displayName: dataView.metadata.columns[1].displayName,
                        value: isRegular
                            ? valueFormatter.format(dataView.categorical.categories[0].values[i], this.labelFormat, true)
                            : "T(" + (i - x.length + 1) + ")"
                    },
                        {
                            displayName: displayName,
                            value: valueFormatter.format(y, this.format, true),
                        },
                        {
                            displayName: isRegular ? null : "PI",
                            value: isRegular ? null : "+/- " + valueFormatter.format(pi, this.format, true),
                        }
                    ]

                dataPoints[0].push({
                    x: i,
                    y: y,
                    pi: isRegular ? 0 : pi,
                    forecast: isRegular ? 0 : 1,
                    label: displayName,
                    color: isRegular ? color : d3.rgb(color).darker(1).toString(),
                    identity: id,
                    tooltipInfo: tooltipInfo,
                });
            }
            
            return {
                dataPoints: dataPoints,
                forecastInfo: forecastInfo,
                legendData: legendData,
                series: series,
                axisLabels: axisLabels,
            }
        }

        public constructor(options?: ForecastChartConstructorOptions) {
            if (options) {
                if (options.svg) {
                    this.svg = options.svg;
                }
                if (options.margin) {
                    this.margin = options.margin;
                }
            }
        }

        public init(options: VisualInitOptions): void {
            var element = options.element;

            this.hostServices = options.host;
            this.colors = options.style.colorPalette.dataColors;

            this.selectionManager = new SelectionManager({ hostServices: options.host });
            this.legend = createLegend(element, false, null, true, LegendPosition.Top);

            if (!this.svg) {
                this.svg = d3.select(element.get(0)).append('svg');
            }
            if (!this.margin) {
                this.margin = ForecastChart.DefaultMargin;
            }
            this.svg.classed(ForecastChart.VisualClassName, true);
            this.colors = options.style.colorPalette.dataColors;

            this.mainGroupElement =
                this.svg
                    .append("g");

            this.axis =
                this.mainGroupElement
                    .append("g")
                    .classed(ForecastChart.Axis.class, true);

            this.axisX =
                this.axis
                    .append("g")
                    .classed(ForecastChart.AxisX.class, true);

            this.axisGrid =
                this.axis
                    .append("g")
                    .classed(ForecastChart.AxisGrid.class, true);

            this.axisY =
                this.axis
                    .append("g")
                    .classed(ForecastChart.AxisY.class, true);

            this.chart =
                this.mainGroupElement
                    .append("g")
                    .classed(ForecastChart.Chart.class, true);

            Legend.positionChartArea(this.svg, this.legend);
        }

        public update(options: VisualUpdateOptions): void {
            if (!options.dataViews || !options.dataViews[0]) {
                this.chart.selectAll(ForecastChart.ChartNode.selector).remove();
                this.axis.selectAll(ForecastChart.AxisX.selector).remove();
                this.axis.selectAll(ForecastChart.AxisY.selector).remove();
                this.axis.selectAll(ForecastChart.AxisGrid.selector).remove();
                return;
            };
            var dataView = this.dataView = options.dataViews[0],
                data = this.data = this.converter(dataView, this.colors),
                dataPoints = data.dataPoints,
                dataViewMetadataColumn: DataViewMetadataColumn,
                duration = options.suppressAnimations ? 0 : 250;

            this.viewport = {
                height: options.viewport.height > 0 ? options.viewport.height : 0,
                width: options.viewport.width > 0 ? options.viewport.width : 0
            };

            var legendProperties: DataViewObject = {
                show: this.getLegendShow(this.dataView),
                showTitle: this.getLegendShowTitle(this.dataView),
                titleText: this.getLegendTitleText(this.dataView),
            }

            LegendData.update(data.legendData, legendProperties);
            if (!this.getLegendShow(this.dataView)) {
                this.LegendSize = this.LegendPadding;
            } else {
                this.LegendSize = this.DefaultLegendSize + this.LegendPadding;
            }

            this.legend.changeOrientation(LegendPosition.Top);
            this.legend.drawLegend(data.legendData, this.viewport);
            this.svg.attr({
                'height': this.viewport.height,
                'width': this.viewport.width
            });

            var mainGroup = this.chart;
            mainGroup.attr('transform', 'scale(1, -1)' + SVGUtil.translate(0, -this.viewport.height + this.AxisSizeX));

            // calculate scalefactor
            var stack = d3.layout.stack();
            var layers = stack(dataPoints);
            this.axisOptions = this.getAxisOptions(
                d3.min(layers, (layer) => {
                    return d3.min(layer, (point) => {
                        return point.y - point.pi;
                    });
                }),
                d3.max(layers, (layer) => {
                    return d3.max(layer, (point) => {
                        return point.y + point.pi;
                    });
                }));

            var yScale = d3.scale
                .linear()
                .domain([this.axisOptions.min, this.axisOptions.max])
                .range([this.ChartPadding, this.viewport.height - this.AxisSizeX - this.LegendSize]);

            var xScale = d3.scale
                .linear()
                .domain([
                    d3.min(layers, (layer) => {
                        return d3.min(layer, (point) => {
                            return point.x;
                        });
                    }),
                    d3.max(layers, (layer) => {
                        return d3.max(layer, (point) => {
                            return point.x;
                        });
                    })])
                .range([this.AxisSizeY, this.viewport.width - this.AxisSizeY]);

            if (dataPoints.length == 0) {
                this.chart.selectAll(ForecastChart.ChartNode.selector).remove();
                this.axis.selectAll(ForecastChart.AxisX.selector).remove();
                this.axis.selectAll(ForecastChart.AxisY.selector).remove();
                this.axis.selectAll(ForecastChart.AxisGrid.selector).remove();

                var warnings: IVisualWarning[] = [];
                warnings.push({
                    code: 'DataSetIvalid',
                    getMessages: () => {
                        var visualMessage: IVisualErrorMessage = {
                            message: "Dataset is empty.",
                            title: '',
                            detail: '',
                        };
                        return visualMessage;
                    }
                });
                this.hostServices.setWarnings(warnings);
                return;
            }

            this.drawChart(dataPoints, xScale, yScale, duration);
            this.drawAxis(dataPoints, xScale, yScale, duration);
            this.drawInfo(data.forecastInfo);
        }

        private drawAxis(dataPoints: ForecastChartDatapoint[][], xScale: D3.Scale.Scale, yScale: D3.Scale.Scale, duration: number) {
            if ((this.axis.selectAll(ForecastChart.AxisX.selector)[0].length == 0) ||
                (this.axis.selectAll(ForecastChart.AxisY.selector)[0].length == 0) ||
                (this.axis.selectAll(ForecastChart.AxisGrid.selector)[0].length == 0)) {
                this.axisGrid = this.axis
                    .append("g")
                    .classed(ForecastChart.AxisGrid.class, true);
                this.axisX = this.axis
                    .append("g")
                    .classed(ForecastChart.AxisX.class, true);
                this.axisY = this.axis
                    .append("g")
                    .classed(ForecastChart.AxisY.class, true);
            }
            var xs = d3.scale
                .ordinal()
                .domain(this.data.axisLabels)
                .rangePoints([this.AxisSizeY, this.viewport.width - this.AxisSizeY]);

            var ys = yScale
                .range([this.viewport.height - this.AxisSizeX - this.ChartPadding, this.LegendSize]);

            var xAxisTransform = this.axisOptions.min > 0
                ? ys(this.axisOptions.min)
                : this.axisOptions.max < 0
                    ? ys(this.axisOptions.min)
                    : ys(0);

            var xAxis = d3.svg
                .axis()
                .scale(xs)
                .orient("bottom");

            var yAxis = d3.svg
                .axis()
                .scale(ys)
                .orient("left")
                .tickFormat(d3.format("s"))
                .ticks(this.axisOptions.ticks);

            this.axisX
                .attr("transform", "translate(0, " + xAxisTransform + ")")
                .transition()
                .duration(duration)
                .call(xAxis);

            this.axisY
                .attr("transform", "translate(" + this.AxisSizeY + ", 0)")
                .transition()
                .duration(duration)
                .call(yAxis);

            if (this.getShowMajorGridLines(this.dataView)) {
                var yGrid = d3.svg
                    .axis()
                    .scale(ys)
                    .orient("left")
                    .ticks(this.axisOptions.ticks * (this.getShowMinorGridLines(this.dataView) ? 5 : 1))
                    .outerTickSize(0)
                    .innerTickSize(-(this.viewport.width - (2 * this.AxisSizeY)));

                this.axisGrid
                    .attr("transform", "translate(" + this.AxisSizeY + ", 0)")
                    .attr("opacity", 1)
                    .transition()
                    .duration(duration)
                    .call(yGrid);
            }
            else {
                this.axisGrid.attr("opacity", 0);
            }
        }

        private drawChart(dataPoints: ForecastChartDatapoint[][], xScale: D3.Scale.Scale, yScale: D3.Scale.Scale, duration: number): void {
            var opacity: number = .5,
                dotRadius: number = 3;

            var stack = d3.layout.stack();
            var layers = stack(dataPoints);

            var sm = this.selectionManager;
            var selection = this.chart
                .selectAll(ForecastChart.ChartNode.selector)
                .data(layers);

            selection.enter()
                .append('g')
                .classed(ForecastChart.ChartNode.class, true);

            this.svg
                .on('click', () => this.selectionManager.clear().then(() => line.style('opacity', 1)));

            var lineData = (points) => {
                return points.map((point) => {
                    return 'M' + point.map((value) => {
                        var x = xScale(value.x);
                        var y = yScale(value.y);
                        return `${x} ${y}`;
                    }).join(' L ');
                })
            };

            var dotData = (value) => {
                var x1 = xScale(value.x);
                var y1 = yScale(value.y);
                var r = dotRadius;
                var r2 = 2 * r;
                return `M ${x1},${y1} m -${r}, 0 a ${r},${r} 0 1,1 ${r2},0 a ${r},${r} 0 1,1 -${r2},0`;
            };

            var piAreaData: D3.Svg.Area = d3.svg.area()
                .interpolate('linear')
                .x(d => xScale(d.x))
                .y0(d => yScale(d.y - d.pi))
                .y1(d => yScale(d.y + d.pi));

            var line = selection.selectAll(ForecastChart.ChartLine.selector).data(d => {
                if (d && d.length > 0) {
                    var values = d.filter((p) => p.forecast == 0)
                    return [
                        [values],
                        [d.filter((p, i) => i >= (values.length - 1))]
                    ];
                }
                return [];
            });

            line.enter()
                .append('path')
                .classed(ForecastChart.ChartLine.class, true);

            line.attr("fill", "none")
                .on('click', function (d) {
                    sm.select(d[0].identity).then((ids) => {
                        if (ids.length > 0) {
                            line.style('opacity', 0.5);
                            d3.select(this)
                                .transition()
                                .duration(duration)
                                .style('opacity', 1);
                        }
                        else {
                            line.style('opacity', 1);
                        }
                    });
                    d3.event.stopPropagation();
                })
                .style('stroke', value => value[0][1].color)
                .style('stroke-width', 2)
                .transition()
                .duration(duration)
                .attr('d', lineData);

            line.exit().remove();

            var piArea = selection.selectAll(ForecastChart.ChartPIArea.selector).data(d => {
                if (d && d.length > 0) {
                    var values = d.filter((p) => p.forecast == 0)
                    return [d.filter((p, i) => i >= (values.length - 1))]
                }
                return [];
            });

            piArea.enter()
                .append('path')
                .classed(ForecastChart.ChartPIArea.class, true);

            piArea.attr("fill", value => value[0].color)
                .attr("opacity", .5)
                .style('stroke', value => value[0].color)
                .style('stroke-width', 2)
                .transition()
                .duration(duration)
                .attr('d', piAreaData);

            piArea.exit().remove();

            var dots = selection.selectAll(ForecastChart.ChartDot.selector)
                .data(d => d);

            dots.enter()
                .append('path')
                .classed(ForecastChart.ChartDot.class, true);

            dots
                .style("fill", value => value.color)
                .transition()
                .duration(duration)
                .attr("d", dotData);

            dots.exit().remove();

            //var dataLabels = selection.selectAll(ForecastChart.ChartDataLabel.selector)
            //    .data(d => d);

            //dataLabels.enter()
            //    .append("text")
            //    .classed(ForecastChart.ChartDataLabel.class, true);

            //var y0 = this.viewport.height + this.AxisSizeX;

            //dataLabels.attr("transform", dataLabel => `translate(0 ${y0}) scale(1, -1)`)
            //    .transition()
            //    .duration(duration)
            //    .text(dataLabel => valueFormatter.format(dataLabel.value, this.format, true))
            //    .attr("x", dataLabel => dataLabel.x)
            //    .attr("y", dataLabel => y0 - dataLabel.y)
            //    .attr("fill", "black");

            //dataLabels.exit().remove();

            TooltipManager.addTooltip(dots, (tooltipEvent: TooltipEvent) => {
                return tooltipEvent.data.tooltipInfo;
            }, true);

            selection.exit().remove();
        }

        private drawInfo(info: ForecastChartInfo) {
            
        }

        private getAxisOptions(min: number, max: number): ForecastAxisOptions {
            var min1 = min == 0
                ? 0
                : min > 0
                    ? (min * .99) - ((max - min) / 100)
                    : (min * 1.01) - ((max - min) / 100);

            var max1 = max == 0
                ? min == 0
                    ? 1
                    : 0
                : max < 0
                    ? (max * .99) + ((max - min) / 100)
                    : (max * 1.01) + ((max - min) / 100);

            var p = Math.log(max1 - min1) / Math.log(10);
            var f = Math.pow(10, p - Math.floor(p));

            var scale = 0.2;
            if (f <= 1.2) scale = 0.2
            else if (f <= 2.5) scale = 0.2
            else if (f <= 5) scale = 0.5
            else if (f <= 10) scale = 1
            else scale = 2;

            var tickSize = scale * Math.pow(10, Math.floor(p));
            var maxValue = tickSize * (Math.floor(max1 / tickSize) + 1);
            var minValue = tickSize * Math.floor(min1 / tickSize);
            var ticks = ((maxValue - minValue) / tickSize) + 1;

            return {
                tickSize: tickSize,
                max: maxValue,
                min: minValue,
                ticks: ticks,
            };
        }

        private initValues(x: number[], p: number): ForecastInitValues {
            var lt = 0;
            var bt = 0;
            var st: number[] = [];

            var filter = [];
            filter[0] = 0.5;
            // Array.fill not yet supported
            for (var j = 1; j < p; j++) {
                filter.push(1);
            }
            filter.push(0.5);
            filter = filter.map(v => v / p);
            
            // Centered moving averages (st)
            for (var i = p / 2; i < 1.5 * p; i++) {
                st[i % p] = x[i] - x.slice(i - (p / 2), i + (p / 2))
                    .map((v, i) => v * filter[i])
                    .reduce((v1, v2) => v1 + v2);
            }

            var startvalues = x.slice(0, 2 * p).map((v, i) => v - st[i % p])
            
            // line fitting via least squares
            var ex = startvalues.map((v, i) => i + 1).reduce((v1, v2) => v1 + v2)
            var ey = startvalues.reduce((v1, v2) => v1 + v2)
            var exy = startvalues.map((v, i) => v * (i + 1)).reduce((v1, v2) => v1 + v2)
            var ex2 = startvalues.map((v, i) => Math.pow(i + 1, 2)).reduce((v1, v2) => v1 + v2)

            bt = ((2 * p * exy) - (ey * ex)) / ((2 * p * ex2) - (ex * ex))
            lt = (1 / (2 * p) * ey) - ((1 / (2 * p)) * bt * ex)

            return {
                lt: lt,
                bt: bt,
                st: st,
            };
        }

        private calcHoltWinters(y: number[], initValues: ForecastInitValues, a: number, b: number, g: number, p: number): ForecastValues {
            var lt: number[] = [];
            var bt: number[] = [];
            var st: number[] = [];
            var ft: number[] = [];
            var mse = 0;

            lt.length = y.length + 1;
            bt.length = y.length + 1;
            st.length = y.length + 1;
            //ft.length = y.length + 1;

            lt[0] = initValues.lt;
            bt[0] = initValues.bt;

            for (var i = 1; i < y.length + 1; i++) {
                var stPrev = i <= p ? initValues.st[i - 1] : st[i - p];
                lt[i] = a * (y[i - 1] - stPrev) + ((1 - a) * (lt[i - 1] + bt[i - 1]));
                bt[i] = b * (lt[i] - lt[i - 1]) + ((1 - b) * bt[i - 1]);
                st[i] = g * (y[i - 1] - lt[i - 1] - bt[i - 1]) + ((1 - g) * stPrev);
                ft.push(lt[i] + st[i]);

                mse += Math.pow(ft[i - 1] - y[i - 1], 2);
            }

            mse /= y.length;
            mse = Math.sqrt(mse);

            var coefficents = {
                lt: lt[y.length - 1],
                bt: bt[y.length - 1],
                st: st.slice(y.length - p, y.length),
            }

            return {
                ft: ft,
                MSE: mse,
                Coefficent: coefficents,
            }
        }

        private predict(c: ForecastCoefficients, h: number): number[] {
            var ft = [];

            for (var i = 1; i <= h; i++) {
                ft[i - 1] = c.lt + (i * c.bt) + c.st[(i - 1) % c.st.length];
            }

            return ft;
        }

        private getSeasonality(dataView: DataView): number {
            return DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.seasonality, 4);
        }

        private getPrediction(dataView: DataView): number {
            return DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.prediction, 4);
        }

        private getShowMajorGridLines(dataView: DataView): boolean {
            return dataView.metadata && DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.showMajorGridLines, true);
        }

        private getShowMinorGridLines(dataView: DataView): boolean {
            return dataView.metadata && DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.showMinorGridLines, false);
        }

        private getDataLabelShow(dataView: DataView): boolean {
            return DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.dataLabelShow, false);
        }

        private getLegendShow(dataView: DataView): boolean {
            return DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.legendShow, false);
        }

        private getLegendShowTitle(dataView: DataView): boolean {
            return DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.legendShowTitle, true);
        }

        private getLegendTitleText(dataView: DataView): string {
            return DataViewObjects.getValue(dataView.metadata.objects, ForecastChart.properties.legendTitleText, this.data.legendData.title);
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];
            switch (options.objectName) {
                case "forecast":
                    var forecast: VisualObjectInstance = {
                        objectName: "forecast",
                        displayName: "Seasonality",
                        selector: null,
                        properties: {
                            season: this.getSeasonality(this.dataView),
                            predict: this.getPrediction(this.dataView),
                        },
                    };
                    instances.push(forecast);
                    break;
                case "dataPoint":
                    var series = this.data.series;
                    for (var i = 0; i < series.length; i++) {
                        var dataPoint: VisualObjectInstance = {
                            objectName: "dataPoint",
                            displayName: series[i].name,
                            selector: ColorHelper.normalizeSelector(series[i].identity.getSelector(), false),
                            properties: {
                                fill: {
                                    solid: { color: series[i].color }
                                }
                            }
                        };
                        instances.push(dataPoint);
                    }
                    break;
                case "gridLines":
                    var gridLines: VisualObjectInstance = {
                        objectName: "gridLines",
                        displayName: "Grid lines",
                        selector: null,
                        properties: {
                            majorGrid: this.getShowMajorGridLines(this.dataView),
                            minorGrid: this.getShowMinorGridLines(this.dataView),
                        }
                    };
                    instances.push(gridLines);
                    break;
                case "labels":
                    var labels: VisualObjectInstance = {
                        objectName: "labels",
                        displayName: "Data labels",
                        selector: null,
                        properties: {
                            show: this.getDataLabelShow(this.dataView),
                        }
                    };
                    instances.push(labels);
                    break;
                case "legend":
                    var legend: VisualObjectInstance = {
                        objectName: "legend",
                        displayName: "Legend", selector: null, properties: { show: this.getLegendShow(this.dataView), showTitle: this.getLegendShowTitle(this.dataView), titleText: this.getLegendTitleText(this.dataView) }
                    };
                    instances.push(legend);
                    break;
            }
            return instances;
        }
    }
}