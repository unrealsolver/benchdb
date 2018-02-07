var app = angular.module('App', [])

function d3Translate(x, y) {
  return 'translate(' + x + ',' + y + ')';
}

function msToTime(millis) {
  var minutes = Math.floor(millis / 6000)
  var seconds = ((millis % 6000) / 100).toFixed(0)
  return minutes + ":" + (seconds < 10 ? '0' : '') + seconds
}

function chunks(data, count) {
  var parts = []
  for (var i = 0; i < data.length; i++) {
    var idx = Math.round(i * (count - 1) / (data.length - 1))
    if (parts[idx]) {
      parts[idx].push(data[i])
    } else {
      parts[idx] = [data[i]]
    }
  }
  
  return parts
}

function getSubdivideLevels(data) {
  var MIN_SUBDIVIDE = 100,
      margin = 3,
      len = data.length
  
  if (len <= MIN_SUBDIVIDE) return [len]
  
  var recur = function(levels) {
    var last = _.last(levels)
    var attempt = last * 10
    if (attempt * margin >= len) {
      return levels.concat(len)
    } else {
      return recur(levels.concat(attempt))
    }
  }
  
  return recur([MIN_SUBDIVIDE], len)
}

function subdivide(data, level) {
  var chunked = chunks(data, level)
  return _.map(chunked, (chunk) => {
    return {
      t: _.first(chunk).t,
      fps: _.sortBy(_.map(chunk, 'fps'))
    }
  })
}

function getDataVariants(data, subdivisionLevels) {
  return _.fromPairs(
   _.map(subdivisionLevels, (level) => {
      return [level, subdivide(data, level)]
    })
  )
}

app.controller('MainCtrl', function($scope) {
  vm = this 

  vm.selectFile = function() {
    document.querySelector('input.csv-file-input').click()
  }
  
  vm.result = {
    frames: null,
    framesAbs: null,
  }
  
  vm.isProcessed = false
  vm.fileContent = ''

  vm.onFileChange = function(el) {
    var f = el.files[0]
    var reader = new FileReader()
    reader.onload = function() {
      $scope.$apply(function() {
        vm.processCSV(reader.result)
      })
    }
    reader.readAsBinaryString(f)
  }

  vm.processCSV = function(content) {
    var iteritems = content.split('\n'),
        frames = [],
        framesData = [],
        t,
        prevT = +iteritems[1].split(',')[1]

    // skip csv header
    // skip first iteration (due to zero ft)
    // skip last empty row
    for (var i = 2; i < iteritems.length - 1; i++) {
      t = +iteritems[i].split(',')[1]
      frames.push(1000 / (t - prevT))
      framesData.push({t: t, fps: 1000 / (t - prevT)})
      prevT = t
    }

    vm.framesData = framesData
    vm.chartData = getDataVariants(framesData, getSubdivideLevels(framesData))
    vm.framesAll = frames
    vm.displayFrames(vm.framesAll)
  } 

  vm.displayFrames = function(frames) {
    vm.isProcessed = true
    vm.stats = [
      ['Min (abs)', d3.min(frames)],
      ['Max (abs)', d3.max(frames)],
      ['Avg', d3.mean(frames)],
      ['Median', d3.median(frames)],
      ['Min 1%', d3.quantile(_.sortBy(frames), .01)],
      ['Min 0.1%', d3.quantile(_.sortBy(frames), .001)],
    ]
  }

})

app.directive('fpsChart', function() { return {
  restrict: 'E',
  scope: {
    data: '='
  },
  link: function($scope, el) {
    var svg = d3.select(el[0]).append('svg')
    var cfg = {
      WIDTH: 800,
      HEIGHT: 500,
      margin: {
        top: 10,
        left: 46,
        bottom: 40,
        right: 10
      },
    }
    
    svg.attrs({
      width: cfg.WIDTH,
      height: cfg.HEIGHT,
    })
    
    cfg.effectiveHeight = cfg.HEIGHT - cfg.margin.top - cfg.margin.bottom
    cfg.effectiveWidth = cfg.WIDTH - cfg.margin.left - cfg.margin.right
    
    var chartG = svg.append('g')
      .attr('transform', d3Translate(cfg.margin.left, cfg.margin.top))
    
    var samples = null
    
    var xScale = d3.scaleLinear()
      .range([0, cfg.effectiveWidth])
      
    var yScale = d3.scaleLinear()
      .range([cfg.effectiveHeight, 0])

    var meanLine = d3.line()
      .x(function(d) {
        return xScale(d.t)
      })
      .y(function(d) {
        return yScale(d3.mean(d.fps))
      })
      
    var q97Line = d3.line()
      .x(function(d) {
        return xScale(d.t)
      })
      .y(function(d) {
        return yScale(d3.quantile(d.fps, .97))
      })
    
    var q03Line = d3.line()
      .x(function(d) {
        return xScale(d.t)
      })
      .y(function(d) {
        return yScale(d3.quantile(d.fps, .03))
      })

    function getMaxX(data) {
      var maxLevel = _.max(_.keys(data))
      return _.last(data[maxLevel]).t
    }

    function getMaxY(data) {
      var maxLevel = _.max(_.keys(data))

      return _.maxBy(data[maxLevel], function(d) {
        return d.fps[0]
      }).fps[0]
    }
    
    // Draw axis labels
    svg.append('g')
      .attr('transform', d3Translate(15, cfg.margin.top + cfg.effectiveHeight / 2))
      .append('text')
      .attrs({
        x: 0,
        y: 0,
        transform: 'rotate(-90)',
        'text-anchor': 'middle',
      })
      .text('FPS')

      svg.append('text')
      .attrs({
        x: cfg.margin.left + cfg.effectiveWidth / 2,
        y: cfg.HEIGHT - cfg.margin.bottom + 35,
        'text-anchor': 'middle',
      })
      .text('Time')

    function redraw(data) {
      samples = data['100']
      xScale.domain([0, getMaxX(data)])
      yScale.domain([0, getMaxY(data)])

      var xAxis = d3.axisBottom(xScale)
        .tickFormat(msToTime)
      var yAxis = d3.axisLeft(yScale)

      svg.append('g')
        .attr('transform', d3Translate(cfg.margin.left, cfg.HEIGHT - cfg.margin.bottom))
        .call(xAxis)
        
      svg.append('g')
        .attr('transform', d3Translate(cfg.margin.left, cfg.margin.top))
        .call(yAxis)
      
      chartG.append('path')
        .attrs({
          d: meanLine(samples),
          class: 'chart-line',
          stroke: 'black',
        })
        
      chartG.append('path')
        .attrs({
          d: q97Line(samples),
          class: 'chart-line',
          stroke: 'green',
        })
        
      chartG.append('path')
        .attrs({
          d: q03Line(samples),
          class: 'chart-line',
          stroke: 'red',
        })
        
      
      chartG.selectAll('line.fps-line')
        .data([60, 120])
        .enter()
        .append('line')
        .attrs({
          class: 'fps-line',
          x1: 0,
          x2: cfg.effectiveWidth,
          y1: yScale,
          y2: yScale,
        })
      }

    $scope.$watch('data', function(old, data) {
      redraw(data)
    })
  }
}})
